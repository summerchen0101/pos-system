import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import {
  listInventoryLogsAdmin,
  listProductsForInventory,
  listWarehousesAdmin,
  type InventoryLogFilterType,
  type InventoryLogListEntry,
} from "../api/inventoryAdmin";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const inv = zhtw.admin.inventory;
const common = zhtw.common;

type FilterValues = {
  warehouseId?: string | null;
  productId?: string | null;
  logType?: InventoryLogFilterType | null;
  range: [Dayjs, Dayjs];
};

function endOfDay(d: Dayjs): Date {
  return d.endOf("day").toDate();
}

function startOfDay(d: Dayjs): Date {
  return d.startOf("day").toDate();
}

export function AdminInventoryLogsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FilterValues>();
  const [rows, setRows] = useState<InventoryLogListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const loadMeta = useCallback(async () => {
    try {
      const [wh, pr] = await Promise.all([listWarehousesAdmin(), listProductsForInventory()]);
      setWarehouses(wh.map((w) => ({ id: w.id, name: w.name })));
      setProducts(pr.map((p) => ({ id: p.id, name: p.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : inv.loadError);
    }
  }, [message]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const v = await form.validateFields();
      const [a, b] = v.range;
      const typeKey = v.logType ?? null;
      const data = await listInventoryLogsAdmin({
        warehouseId: v.warehouseId ?? null,
        productId: v.productId ?? null,
        type: typeKey,
        rangeStart: startOfDay(a),
        rangeEnd: endOfDay(b),
      });
      setRows(data);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : inv.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  useEffect(() => {
    form.setFieldsValue({ range: [dayjs().subtract(6, "day"), dayjs()] });
  }, [form]);

  useEffect(() => {
    void fetchLogs();
    // Initial query only; use「套用」or filters to refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<InventoryLogListEntry> = [
    {
      title: inv.colTime,
      dataIndex: "created_at",
      key: "t",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: inv.colLogWarehouse,
      key: "wh",
      render: (_, r) => r.warehouseName?.trim() || common.dash,
    },
    {
      title: inv.colLogProduct,
      key: "pr",
      render: (_, r) => r.productName?.trim() || common.dash,
    },
    {
      title: inv.colLogType,
      dataIndex: "type",
      key: "ty",
      width: 110,
      render: (t: string, r) => {
        if (t === "out" && r.related_order_id) return inv.logsTypePosOut;
        if (t === "out") return inv.logsTypeOutManual;
        return inv.logTypeDisplay(t);
      },
    },
    {
      title: inv.colLogQty,
      dataIndex: "quantity",
      key: "q",
      width: 72,
      align: "right",
    },
    {
      title: inv.colNote,
      dataIndex: "note",
      key: "n",
      ellipsis: true,
      render: (n: string | null) => n?.trim() || common.dash,
    },
    {
      title: inv.colOperator,
      key: "op",
      width: 100,
      render: (_, r) => r.createdByName?.trim() || common.dash,
    },
    {
      title: inv.colRelatedOrder,
      dataIndex: "related_order_id",
      key: "ord",
      width: 260,
      ellipsis: true,
      render: (id: string | null) => id ?? common.dash,
    },
  ];

  const typeOptions = [
    { value: "in", label: inv.logsTypeIn },
    { value: "out_manual", label: inv.logsTypeOutManual },
    { value: "pos_out", label: inv.logsTypePosOut },
    { value: "transfer", label: inv.logsTypeTransfer },
    { value: "adjust", label: inv.logsTypeAdjust },
  ];

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginBottom: 8 }}>
        {inv.logsTitle}
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {inv.logsHint}
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Space wrap size="middle" align="start">
            <Form.Item name="range" label={inv.logsFilterRange} style={{ marginBottom: 0 }}>
              <DatePicker.RangePicker style={{ width: 280 }} />
            </Form.Item>
            <Form.Item name="warehouseId" label={inv.filterWarehouse} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={inv.filterWarehouseAll}
                style={{ minWidth: 200 }}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
            </Form.Item>
            <Form.Item name="productId" label={inv.labelProduct} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={inv.labelProduct}
                style={{ minWidth: 220 }}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
            <Form.Item name="logType" label={inv.logsFilterType} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={inv.logsTypeAll}
                style={{ minWidth: 160 }}
                options={typeOptions}
              />
            </Form.Item>
            <Form.Item label=" " style={{ marginBottom: 0 }}>
              <Button type="primary" onClick={() => void fetchLogs()}>
                {common.apply}
              </Button>
            </Form.Item>
          </Space>
        </Form>
      </Card>
      <Card>
        <Table<InventoryLogListEntry>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 30 }}
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
}
