import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAdminRole } from "../api/authProfile";
import {
  fetchInventoryMatrix,
  inventoryStockIn,
  inventoryStockOut,
  inventoryTransferBetween,
  type ProductWithCategory,
} from "../api/inventoryAdmin";
import { createStocktakeAdmin } from "../api/stocktakesAdmin";
import { useAuth } from "../auth/AuthContext";
import { ProductSelect } from "../components/admin/ProductSelect";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const inv = zhtw.admin.inventory;
const st = zhtw.admin.stocktakes;
const common = zhtw.common;

type MatrixRow = {
  product: ProductWithCategory;
  stockByWarehouse: Record<string, number>;
};

type StockModalMode = "in" | "out";

function stockCellStyle(n: number): CSSProperties | undefined {
  if (n <= 0) return { color: "#ff7875", fontWeight: 600 };
  if (n <= 5) return { color: "#d89614", fontWeight: 600 };
  return undefined;
}

function rpcErrorMessage(e: unknown): string {
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
  if (msg.includes("insufficient_stock")) return inv.insufficientStock;
  if (msg.includes("forbidden")) return inv.forbidden;
  if (msg === "invalid_qty") return inv.invalidQty;
  return msg || inv.saveError;
}

function stocktakeCreateErrorMessage(raw: string): string {
  if (raw.includes("stocktake_draft_exists")) return st.draftExistsError;
  return raw || st.createError;
}

export function AdminInventoryOverviewPage() {
  const { message } = App.useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const admin = profile ? isAdminRole(profile.role) : false;
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [filterWarehouseId, setFilterWarehouseId] = useState<string | "all">("all");
  const [nameQ, setNameQ] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferForm] = Form.useForm<{
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    note?: string;
  }>();
  const [stockOpen, setStockOpen] = useState(false);
  const [stockMode, setStockMode] = useState<StockModalMode>("in");
  const [stockSaving, setStockSaving] = useState(false);
  const [stockProduct, setStockProduct] = useState<{ id: string; name: string } | null>(null);
  const [stockForm] = Form.useForm<{ warehouseId: string; quantity: number; note?: string }>();
  const [stModalOpen, setStModalOpen] = useState(false);
  const [stCreating, setStCreating] = useState(false);
  const [stForm] = Form.useForm<{ warehouseId: string; note?: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await fetchInventoryMatrix();
      setWarehouses(m.warehouses);
      setRows(m.rows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : inv.loadError);
      setWarehouses([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleWarehouses = useMemo(() => {
    if (filterWarehouseId === "all") return warehouses;
    return warehouses.filter((w) => w.id === filterWarehouseId);
  }, [filterWarehouseId, warehouses]);

  const filteredRows = useMemo(() => {
    const q = nameQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.product.name.toLowerCase().includes(q));
  }, [rows, nameQ]);

  const openStock = (mode: StockModalMode, product: ProductWithCategory) => {
    setStockMode(mode);
    setStockProduct({ id: product.id, name: product.name });
    stockForm.resetFields();
    stockForm.setFieldsValue({
      warehouseId: filterWarehouseId !== "all" ? filterWarehouseId : undefined,
      quantity: 1,
      note: undefined,
    });
    setStockOpen(true);
  };

  const submitStock = async () => {
    if (!stockProduct) return;
    try {
      const v = await stockForm.validateFields();
      setStockSaving(true);
      if (stockMode === "in") {
        await inventoryStockIn({
          warehouseId: v.warehouseId,
          productId: stockProduct.id,
          quantity: v.quantity,
          note: v.note?.trim() ? v.note.trim() : null,
        });
        message.success(inv.okStockIn);
      } else {
        await inventoryStockOut({
          warehouseId: v.warehouseId,
          productId: stockProduct.id,
          quantity: v.quantity,
          note: v.note?.trim() ? v.note.trim() : null,
        });
        message.success(inv.okStockOut);
      }
      setStockOpen(false);
      setStockProduct(null);
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(rpcErrorMessage(e));
    } finally {
      setStockSaving(false);
    }
  };

  const submitTransfer = async () => {
    try {
      const v = await transferForm.validateFields();
      setTransferSaving(true);
      await inventoryTransferBetween({
        fromWarehouseId: v.fromWarehouseId,
        toWarehouseId: v.toWarehouseId,
        productId: v.productId,
        quantity: v.quantity,
        note: v.note?.trim() ? v.note.trim() : null,
      });
      message.success(inv.okTransfer);
      setTransferOpen(false);
      transferForm.resetFields();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(rpcErrorMessage(e));
    } finally {
      setTransferSaving(false);
    }
  };

  const openTransfer = () => {
    transferForm.resetFields();
    transferForm.setFieldsValue({ quantity: 1 });
    setTransferOpen(true);
  };

  const submitStocktakeCreate = async () => {
    try {
      const v = await stForm.validateFields();
      setStCreating(true);
      const id = await createStocktakeAdmin({
        warehouseId: v.warehouseId,
        note: v.note?.trim() ? v.note.trim() : null,
      });
      message.success(st.createdOk);
      setStModalOpen(false);
      navigate(`/admin/inventory/stocktakes/${id}`);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
      message.error(stocktakeCreateErrorMessage(msg));
    } finally {
      setStCreating(false);
    }
  };

  const columns: ColumnsType<MatrixRow> = useMemo(() => {
    const base: ColumnsType<MatrixRow> = [
      { title: inv.colProduct, key: "pname", render: (_, r) => r.product.name },
      {
        title: inv.colCategory,
        key: "cat",
        width: 120,
        render: (_, r) => r.product.categoryName?.trim() || common.dash,
      },
    ];
    for (const w of visibleWarehouses) {
      base.push({
        title: w.name,
        key: `wh-${w.id}`,
        width: 110,
        align: "right",
        render: (_, r) => {
          const n = r.stockByWarehouse[w.id] ?? 0;
          return <span style={stockCellStyle(n)}>{n}</span>;
        },
      });
    }
    base.push({
      title: inv.colActions,
      key: "act",
      width: 220,
      fixed: "right",
      render: (_, r) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openStock("in", r.product)}>
            {inv.stockIn}
          </Button>
          <Button type="link" size="small" onClick={() => openStock("out", r.product)}>
            {inv.stockOut}
          </Button>
        </Space>
      ),
    });
    return base;
  }, [visibleWarehouses]);

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {inv.overviewTitle}
        </Title>
        <Space wrap>
          <Link to="/admin/inventory/stocktakes">
            <Button>{st.goManage}</Button>
          </Link>
          {admin ? (
            <Button
              onClick={() => {
                stForm.resetFields();
                setStModalOpen(true);
              }}>
              {st.newStocktake}
            </Button>
          ) : null}
          <Button type="primary" onClick={openTransfer}>
            {inv.transfer}
          </Button>
        </Space>
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {inv.overviewHint}
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle" style={{ width: "100%" }}>
          <Space>
            <Text type="secondary">{inv.filterWarehouse}</Text>
            <Select
              style={{ minWidth: 200 }}
              value={filterWarehouseId}
              onChange={(v) => setFilterWarehouseId(v)}
              options={[
                { value: "all", label: inv.filterWarehouseAll },
                ...warehouses.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
          </Space>
          <Space>
            <Text type="secondary">{inv.filterName}</Text>
            <Input
              allowClear
              placeholder={inv.filterNamePh}
              value={nameQ}
              onChange={(e) => setNameQ(e.target.value)}
              style={{ width: 220 }}
            />
          </Space>
        </Space>
      </Card>
      <Card>
        <Table<MatrixRow>
          rowKey={(r) => r.product.id}
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          scroll={{ x: Math.max(600, 260 + visibleWarehouses.length * 110) }}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={stockProduct ? inv.modalStockTitle(stockMode) : ""}
        open={stockOpen}
        onCancel={() => {
          setStockOpen(false);
          setStockProduct(null);
        }}
        onOk={() => void submitStock()}
        confirmLoading={stockSaving}
        destroyOnClose
        okText={common.apply}>
        {stockProduct ? (
          <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            {stockProduct.name}
          </Text>
        ) : null}
        <Form form={stockForm} layout="vertical">
          <Form.Item
            name="warehouseId"
            label={inv.labelWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder={inv.filterWarehouseAll}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label={inv.labelQty}
            rules={[{ required: true, message: common.required }]}>
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label={inv.labelNote}>
            <Input.TextArea rows={2} placeholder={inv.notePh} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={inv.modalTransferTitle}
        open={transferOpen}
        onCancel={() => setTransferOpen(false)}
        onOk={() => void submitTransfer()}
        confirmLoading={transferSaving}
        destroyOnClose
        okText={common.apply}
        width={520}>
        <Form form={transferForm} layout="vertical">
          <Form.Item
            name="productId"
            label={inv.labelProduct}
            rules={[{ required: true, message: common.required }]}>
            <ProductSelect placeholder={inv.labelProduct} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="fromWarehouseId"
            label={inv.labelFromWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item
            name="toWarehouseId"
            label={inv.labelToWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label={inv.labelQty}
            rules={[{ required: true, message: common.required }]}>
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label={inv.labelNote}>
            <Input.TextArea rows={2} placeholder={inv.notePh} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={st.modalCreateTitle}
        open={admin && stModalOpen}
        onCancel={() => setStModalOpen(false)}
        onOk={() => void submitStocktakeCreate()}
        confirmLoading={stCreating}
        destroyOnClose
        okText={common.save}>
        <Form form={stForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="warehouseId"
            label={st.labelWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder={st.labelWarehouse}
            />
          </Form.Item>
          <Form.Item name="note" label={st.labelNote}>
            <Input.TextArea rows={2} placeholder={st.notePh} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
