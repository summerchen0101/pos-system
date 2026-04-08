import { CopyOutlined, ExportOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  copyBoothAdmin,
  createBooth,
  deleteBooth,
  listBoothsAdmin,
  updateBooth,
  type AdminBooth,
} from "../api/boothsAdmin";
import { fetchBoothVisibilityForPos, replaceBoothVisibilityAdmin } from "../api/boothVisibilityAdmin";
import { listCategoriesAdmin } from "../api/categoriesAdmin";
import { listWarehousesAdmin } from "../api/inventoryAdmin";
import { listProductsAdmin } from "../api/productsAdmin";
import { formatBoothActivityRangeLabel } from "../lib/boothActivity";
import { posBoothDirectUrl } from "../lib/posBoothDirectUrl";
import { zhtw } from "../locales/zhTW";
import type { Category, Product } from "../types/pos";

const { Title, Text } = Typography;
const b = zhtw.admin.booths;
const common = zhtw.common;

type FormValues = {
  name: string;
  location?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  warehouse_id?: string | null;
  pin_new?: string;
  remove_pin?: boolean;
};

type CopyFormValues = {
  name: string;
  location?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  copyPromotions: boolean;
  copyProducts: boolean;
};

function boothDeleteErrorMessage(raw: string): string {
  if (raw === "BOOTH_DELETE_DEFAULT") return b.cannotDeleteDefault;
  if (raw === "BOOTH_HAS_ORDERS") return b.deleteBlockedOrders;
  return b.deleteError;
}

function activityPeriodCell(row: AdminBooth): string {
  const label = formatBoothActivityRangeLabel(row.start_date, row.end_date);
  return label ?? b.activityDash;
}

export function AdminBoothsPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [copyForm] = Form.useForm<CopyFormValues>();
  const [rows, setRows] = useState<AdminBooth[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<AdminBooth | null>(null);
  const [copySaving, setCopySaving] = useState(false);
  const [modalTab, setModalTab] = useState<string>("basic");
  const [editingHadPin, setEditingHadPin] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [boothList, wh] = await Promise.all([listBoothsAdmin(), listWarehousesAdmin()]);
      setRows(boothList);
      setWarehouseOptions(wh.map((w) => ({ value: w.id, label: w.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : b.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [cats, prods] = await Promise.all([listCategoriesAdmin(), listProductsAdmin()]);
        setCatalogCategories(cats);
        setCatalogProducts(
          prods.filter((p) => p.isActive && (p.kind === "STANDARD" || p.kind === "CUSTOM_BUNDLE")),
        );
      } catch {
        message.error(b.visibilityLoadCatalogError);
        setCatalogCategories([]);
        setCatalogProducts([]);
      }
    })();
  }, [message]);

  const openCreate = () => {
    setEditingId(null);
    setEditingHadPin(false);
    setModalTab("basic");
    setHiddenCategoryIds([]);
    setHiddenProductIds([]);
    setProductSearch("");
    setVisibilityLoading(false);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      location: "",
      start_date: undefined,
      end_date: undefined,
      warehouse_id: undefined,
      pin_new: "",
      remove_pin: false,
    });
    setModalOpen(true);
  };

  const onDelete = (row: AdminBooth) => {
    modal.confirm({
      title: b.deleteTitle,
      content: b.deleteBody(row.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteBooth(row.id);
          message.success(b.deleted);
          await load();
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          message.error(boothDeleteErrorMessage(code));
        }
      },
    });
  };

  const openEdit = async (row: AdminBooth) => {
    setEditingId(row.id);
    setEditingHadPin(row.hasPin);
    setModalTab("basic");
    setHiddenCategoryIds([]);
    setHiddenProductIds([]);
    setProductSearch("");
    form.setFieldsValue({
      name: row.name,
      location: row.location ?? "",
      start_date: row.start_date ? dayjs(row.start_date) : undefined,
      end_date: row.end_date ? dayjs(row.end_date) : undefined,
      warehouse_id: row.warehouse_id ?? undefined,
      pin_new: "",
      remove_pin: false,
    });
    setModalOpen(true);
    setVisibilityLoading(true);
    try {
      const vis = await fetchBoothVisibilityForPos(row.id);
      setHiddenCategoryIds([...vis.hiddenCategoryIds]);
      setHiddenProductIds([...vis.hiddenProductIds]);
    } catch {
      message.error(b.visibilityLoadBoothError);
      setHiddenCategoryIds([]);
      setHiddenProductIds([]);
    } finally {
      setVisibilityLoading(false);
    }
  };

  const openCopy = (row: AdminBooth) => {
    setCopySource(row);
    copyForm.setFieldsValue({
      name: `${row.name}（複製）`,
      location: row.location ?? "",
      start_date: undefined,
      end_date: undefined,
      copyPromotions: true,
      copyProducts: true,
    });
    setCopyModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setEditingHadPin(false);
    setModalTab("basic");
    setHiddenCategoryIds([]);
    setHiddenProductIds([]);
    setProductSearch("");
    form.resetFields();
  };

  const toggleHiddenCategory = (categoryId: string, hide: boolean) => {
    setHiddenCategoryIds((prev) => {
      const next = hide ? [...new Set([...prev, categoryId])] : prev.filter((x) => x !== categoryId);
      if (hide) {
        setHiddenProductIds((hp) =>
          hp.filter((pid) => {
            const p = catalogProducts.find((x) => x.id === pid);
            return !p?.categoryId || p.categoryId !== categoryId;
          }),
        );
      }
      return next;
    });
  };

  const toggleHiddenProduct = (productId: string, hide: boolean) => {
    setHiddenProductIds((prev) =>
      hide ? [...new Set([...prev, productId])] : prev.filter((x) => x !== productId),
    );
  };

  const cleanedHiddenProductIds = useMemo(() => {
    const cat = new Set(hiddenCategoryIds);
    return hiddenProductIds.filter((pid) => {
      const p = catalogProducts.find((x) => x.id === pid);
      if (!p?.categoryId) return true;
      return !cat.has(p.categoryId);
    });
  }, [hiddenCategoryIds, hiddenProductIds, catalogProducts]);

  const filteredProductsForVisibility = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = [...catalogProducts].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    if (!q) return list;
    return list.filter((p) => {
      const cn = (p.categoryName ?? "").toLowerCase();
      return p.name.toLowerCase().includes(q) || cn.includes(q);
    });
  }, [catalogProducts, productSearch]);

  const closeCopyModal = () => {
    setCopyModalOpen(false);
    setCopySource(null);
    copyForm.resetFields();
  };

  const dateToIso = (d: Dayjs | null | undefined): string | null =>
    d && d.isValid() ? d.format("YYYY-MM-DD") : null;

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const startDate = dateToIso(v.start_date ?? null);
      const endDate = dateToIso(v.end_date ?? null);
      if (editingId) {
        const patch: Parameters<typeof updateBooth>[1] = {
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
          startDate,
          endDate,
          warehouseId: v.warehouse_id ?? null,
        };
        if (v.remove_pin) {
          patch.pin = null;
        } else if (v.pin_new?.trim()) {
          patch.pin = v.pin_new.trim();
        }
        await updateBooth(editingId, patch);
        try {
          await replaceBoothVisibilityAdmin(editingId, hiddenCategoryIds, cleanedHiddenProductIds);
        } catch (ve) {
          message.error(ve instanceof Error ? ve.message : b.visibilitySaveError);
          throw ve;
        }
        message.success(b.updated);
      } else {
        await createBooth({
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
          startDate,
          endDate,
          warehouseId: v.warehouse_id ?? null,
          pin: v.pin_new?.trim() ? v.pin_new.trim() : null,
        });
        message.success(b.created);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      if (e instanceof Error && e.message === "INVALID_BOOTH_PIN") {
        message.error(b.pinFormatError);
        return;
      }
      message.error(e instanceof Error ? e.message : b.saveError);
    } finally {
      setSaving(false);
    }
  };

  const submitCopy = async () => {
    if (!copySource) return;
    try {
      const v = await copyForm.validateFields();
      setCopySaving(true);
      const { promotionsCopied } = await copyBoothAdmin({
        sourceBoothId: copySource.id,
        name: v.name.trim(),
        location: v.location?.trim() ? v.location.trim() : null,
        startDate: dateToIso(v.start_date ?? null),
        endDate: dateToIso(v.end_date ?? null),
        copyPromotions: v.copyPromotions,
        copyProductSettings: v.copyProducts,
      });
      message.success(b.copiedWithPromotions(promotionsCopied));
      closeCopyModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : b.copyError);
    } finally {
      setCopySaving(false);
    }
  };

  const dateOrderValidator = (_: unknown, endVal: Dayjs | null | undefined) => {
    const start = form.getFieldValue("start_date") as Dayjs | null | undefined;
    if (!start || !endVal || !start.isValid() || !endVal.isValid()) return Promise.resolve();
    if (!endVal.isAfter(start, "day")) {
      return Promise.reject(new Error(b.dateOrderError));
    }
    return Promise.resolve();
  };

  const copyDateOrderValidator = (_: unknown, endVal: Dayjs | null | undefined) => {
    const start = copyForm.getFieldValue("start_date") as Dayjs | null | undefined;
    if (!start || !endVal || !start.isValid() || !endVal.isValid()) return Promise.resolve();
    if (!endVal.isAfter(start, "day")) {
      return Promise.reject(new Error(b.dateOrderError));
    }
    return Promise.resolve();
  };

  const copyDirectUrl = async (boothId: string) => {
    const url = posBoothDirectUrl(boothId);
    try {
      await navigator.clipboard.writeText(url);
      message.success(b.directUrlCopied);
    } catch {
      message.error(b.directUrlCopyFailed);
    }
  };

  const columns: ColumnsType<AdminBooth> = [
    { title: b.colName, dataIndex: "name", key: "name" },
    {
      title: b.colLocation,
      dataIndex: "location",
      key: "loc",
      render: (loc: string | null) => loc?.trim() || common.dash,
    },
    {
      title: b.colActivityPeriod,
      key: "period",
      width: 200,
      render: (_, row) => activityPeriodCell(row),
    },
    {
      title: b.colDirectUrl,
      key: "direct",
      width: 320,
      render: (_, row) => {
        const url = posBoothDirectUrl(row.id);
        return (
          <Space size={4} align="center" style={{ maxWidth: "100%" }} wrap={false}>
            <Typography.Text
              ellipsis={{ tooltip: url }}
              style={{ maxWidth: 200, flex: "1 1 auto", marginBottom: 0 }}>
              {url}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              aria-label={b.copyDirectUrlAria}
              onClick={() => void copyDirectUrl(row.id)}
            />
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
              aria-label={b.openDirectUrlAria}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            />
          </Space>
        );
      },
    },
    {
      title: b.colActions,
      key: "act",
      width: 200,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => void openEdit(row)}>
            {common.edit}
          </Button>
          <Button type="link" size="small" onClick={() => openCopy(row)}>
            {b.copy}
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            {common.delete}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <Space
        align="center"
        style={{
          justifyContent: "space-between",
          width: "100%",
          marginBottom: 16,
        }}>
        <Title level={4} style={{ margin: 0 }}>
          {b.pageTitle}
        </Title>
        <Button type="primary" onClick={openCreate}>
          {b.newBooth}
        </Button>
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {b.hint}
      </Text>
      <Card>
        <Table<AdminBooth>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal
        title={editingId ? b.modalEdit : b.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        okText={common.save}
        width={editingId ? 720 : 520}>
        <Tabs
          activeKey={editingId ? modalTab : "basic"}
          onChange={editingId ? setModalTab : undefined}
          items={[
            {
              key: "basic",
              label: b.tabBasic,
              children: (
                <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                  <Form.Item
                    name="name"
                    label={b.labelName}
                    rules={[{ required: true, message: common.required }]}>
                    <Input placeholder={b.namePh} />
                  </Form.Item>
                  <Form.Item name="location" label={b.labelLocation}>
                    <Input placeholder={b.locationPh} />
                  </Form.Item>
                  <Form.Item name="start_date" label={b.labelStartDate}>
                    <DatePicker style={{ width: "100%" }} allowClear />
                  </Form.Item>
                  <Form.Item
                    name="end_date"
                    label={b.labelEndDate}
                    dependencies={["start_date"]}
                    rules={[{ validator: dateOrderValidator }]}>
                    <DatePicker style={{ width: "100%" }} allowClear />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => prev.remove_pin !== cur.remove_pin}>
                    {() => (
                      <Form.Item
                        name="pin_new"
                        label={b.labelPin}
                        extra={<Text type="secondary">{b.pinExtra}</Text>}
                        dependencies={editingId ? ["remove_pin"] : []}
                        rules={[
                          {
                            validator: async (_, val) => {
                              if (editingId && form.getFieldValue("remove_pin")) return;
                              const s = typeof val === "string" ? val.trim() : "";
                              if (!s) return;
                              if (!/^[0-9]{4,6}$/.test(s)) {
                                throw new Error(b.pinFormatError);
                              }
                            },
                          },
                        ]}>
                        <Input.Password
                          placeholder={editingId ? b.pinPlaceholderEdit : b.pinPlaceholderCreate}
                          maxLength={6}
                          inputMode="numeric"
                          autoComplete="new-password"
                          disabled={Boolean(editingId && form.getFieldValue("remove_pin"))}
                        />
                      </Form.Item>
                    )}
                  </Form.Item>
                  {editingId && editingHadPin ? (
                    <Form.Item name="remove_pin" valuePropName="checked">
                      <Checkbox>{b.pinRemove}</Checkbox>
                    </Form.Item>
                  ) : null}
                  <Form.Item
                    name="warehouse_id"
                    label={b.labelWarehouse}
                    extra={<Text type="secondary">{b.warehousePh}</Text>}>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={b.labelWarehouse}
                      options={warehouseOptions}
                    />
                  </Form.Item>
                </Form>
              ),
            },
            ...(editingId
              ? [
                  {
                    key: "visibility",
                    label: b.tabVisibility,
                    children: (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                          {b.visibilityHint}
                        </Text>
                        {visibilityLoading ? (
                          <Text type="secondary">{common.loading}</Text>
                        ) : (
                          <>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
                              {b.visibilityHiddenCategories}
                            </Title>
                            <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                              {b.visibilityHiddenCategoriesHint}
                            </Text>
                            <div
                              style={{
                                maxHeight: 200,
                                overflowY: "auto",
                                marginBottom: 20,
                                padding: 8,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 8,
                              }}>
                              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                                {catalogCategories.map((c) => (
                                  <Checkbox
                                    key={c.id}
                                    checked={hiddenCategoryIds.includes(c.id)}
                                    onChange={(e) => toggleHiddenCategory(c.id, e.target.checked)}>
                                    {c.name}
                                  </Checkbox>
                                ))}
                              </Space>
                            </div>
                            <Title level={5} style={{ marginBottom: 8 }}>
                              {b.visibilityHiddenProducts}
                            </Title>
                            <Input
                              allowClear
                              placeholder={b.visibilityProductSearchPh}
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              style={{ marginBottom: 12 }}
                            />
                            <div
                              style={{
                                maxHeight: 280,
                                overflowY: "auto",
                                padding: 8,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 8,
                              }}>
                              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                                {filteredProductsForVisibility.map((p) => {
                                  const hiddenByCat = Boolean(
                                    p.categoryId && hiddenCategoryIds.includes(p.categoryId),
                                  );
                                  const checked = hiddenByCat || hiddenProductIds.includes(p.id);
                                  const catLabel = p.categoryName?.trim() || b.visibilityUncategorized;
                                  return (
                                    <div
                                      key={p.id}
                                      style={{
                                        opacity: hiddenByCat ? 0.55 : 1,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        flexWrap: "wrap",
                                      }}>
                                      <Checkbox
                                        checked={checked}
                                        disabled={hiddenByCat}
                                        onChange={(e) => {
                                          if (hiddenByCat) return;
                                          toggleHiddenProduct(p.id, e.target.checked);
                                        }}
                                      />
                                      <span>
                                        {p.name}
                                        <Text type="secondary" style={{ marginLeft: 8 }}>
                                          （{catLabel}）
                                        </Text>
                                      </span>
                                      {hiddenByCat ? (
                                        <Tag>{b.visibilityHiddenByCategoryTag}</Tag>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </Space>
                            </div>
                          </>
                        )}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Modal>

      <Modal
        title={b.copyModalTitle}
        open={copyModalOpen}
        onCancel={closeCopyModal}
        onOk={() => void submitCopy()}
        confirmLoading={copySaving}
        destroyOnClose
        okText={b.copyConfirm}>
        <Form form={copyForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label={b.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={b.namePh} />
          </Form.Item>
          <Form.Item name="location" label={b.labelLocation}>
            <Input placeholder={b.locationPh} />
          </Form.Item>
          <Form.Item name="start_date" label={b.labelStartDate}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item
            name="end_date"
            label={b.labelEndDate}
            dependencies={["start_date"]}
            rules={[{ validator: copyDateOrderValidator }]}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item name="copyPromotions" valuePropName="checked">
            <Checkbox>{b.copyPromotions}</Checkbox>
          </Form.Item>
          <Form.Item
            name="copyProducts"
            valuePropName="checked"
            extra={<Text type="secondary">{b.copyProductsHint}</Text>}>
            <Checkbox>{b.copyProducts}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
