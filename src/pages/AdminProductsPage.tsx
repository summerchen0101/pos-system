import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HolderOutlined, MinusCircleOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import {
  App,
  AutoComplete,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Key } from "react";
import { listCategoriesAdmin } from "../api/categoriesAdmin";
import {
  bulkPatchProducts,
  createProduct,
  deleteProduct,
  listDistinctProductSizes,
  listProductsAdmin,
  setProductImageUrl,
  updateProduct,
  updateProductsOrder,
  type BundleGroupInput,
  type ProductBulkPatch,
  type ProductInput,
  type ProductListFilters,
} from "../api/productsAdmin";
import { removeProductImageFromUrl, uploadProductImage } from "../api/productImageStorage";
import { ProductSelect } from "../components/admin/ProductSelect";
import { zhtw } from "../locales/zhTW";
import { formatMoney } from "../lib/money";
import type { Category, Product, ProductKind } from "../types/pos";

const UNCATEGORIZED_SORT_KEY = "__uncategorized__";

const { Title, Text } = Typography;
const p = zhtw.admin.products;
const common = zhtw.common;

type BundleGroupFormRow = {
  name?: string;
  requiredQty?: number;
  productIds?: string[];
};

type FormValues = {
  categoryId?: string | null;
  name: string;
  nameEn?: string;
  description?: string;
  size?: string;
  sku: string;
  priceDollars: number;
  stock: number;
  isActive: boolean;
  productKind: ProductKind;
  bundleGroups?: BundleGroupFormRow[];
  /** Committed public image URL; cleared in form means default tile in POS. */
  imageUrl?: string | null;
};

type BulkStockMode = "set" | "adjust";

type BulkFormValues = {
  bulkCategoryId?: string | null;
  bulkSize?: string;
  bulkPriceDollars?: number | null;
  bulkStockMode?: BulkStockMode;
  bulkStockValue?: number | null;
};

type FilterFormValues = {
  filterName?: string;
  filterSku?: string;
  filterSize?: string;
  filterCategoryId?: string;
};

function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

function centsToDollars(c: number): number {
  return Math.round(c) / 100;
}

function toBundleGroupsInput(rows: BundleGroupFormRow[] | undefined): BundleGroupInput[] {
  const list = rows ?? [];
  return list.map((row, i) => {
    const rawIds = row.productIds ?? [];
    const productIds = [...new Set(rawIds.filter(Boolean))];
    return {
      name: row.name?.trim() ? row.name.trim() : "選配",
      requiredQty: Math.max(1, Math.trunc(Number(row.requiredQty) || 0)),
      sortOrder: i,
      productIds,
    };
  });
}

function buildProductOrderMap(
  plist: Product[],
  categoryIdsOrdered: string[],
): Record<string, string[]> {
  const orderMap: Record<string, string[]> = {};
  for (const id of categoryIdsOrdered) orderMap[id] = [];
  const unc: string[] = [];
  for (const p of plist) {
    if (!p.categoryId) {
      unc.push(p.id);
      continue;
    }
    if (!orderMap[p.categoryId]) orderMap[p.categoryId] = [];
    orderMap[p.categoryId].push(p.id);
  }
  if (unc.length > 0) orderMap[UNCATEGORIZED_SORT_KEY] = unc;
  return orderMap;
}

function SortableProductOrderRow(props: { product: Product; categoryKey: string }) {
  const { product: p, categoryKey } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
    data: { dndType: "product" as const, categoryKey },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: isDragging ? "0 6px 20px rgba(0,0,0,0.2)" : undefined,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    marginBottom: 6,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.02)",
  };
  const catLabel = p.categoryName?.trim() || "";
  return (
    <div ref={setNodeRef} style={style}>
      <button
        type="button"
        aria-label="排序"
        className="admin-catalog-sort__handle"
        {...attributes}
        {...listeners}>
        <HolderOutlined />
      </button>
      <div>
        <Text>{p.name}</Text>
        {catLabel ? (
          <Text type="secondary" style={{ marginLeft: 8 }}>
            （{catLabel}）
          </Text>
        ) : null}
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {p.sku}
            {p.size?.trim() ? ` · ${p.size}` : ""}
          </Text>
        </div>
      </div>
    </div>
  );
}

function toInput(values: FormValues): ProductInput {
  const kind = values.productKind ?? "STANDARD";
  return {
    categoryId: values.categoryId ?? null,
    name: values.name,
    nameEn: values.nameEn?.trim() ? values.nameEn.trim() : null,
    description: values.description?.trim() ? values.description.trim() : null,
    size: values.size?.trim() ? values.size.trim() : null,
    sku: values.sku,
    priceCents: dollarsToCents(values.priceDollars),
    stock: Math.max(0, Math.floor(Number(values.stock) || 0)),
    isActive: values.isActive,
    kind,
    bundleGroups: kind === "CUSTOM_BUNDLE" ? toBundleGroupsInput(values.bundleGroups) : [],
    imageUrl: values.imageUrl?.trim() ? values.imageUrl.trim() : null,
  };
}

export function AdminProductsPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [bulkForm] = Form.useForm<BulkFormValues>();
  const [filterForm] = Form.useForm<FilterFormValues>();
  const [adminTab, setAdminTab] = useState<string>("list");
  const [sortLoading, setSortLoading] = useState(false);
  /** Category id order for grouping product sort blocks (from server; not draggable here). */
  const [sortTabCategoryIds, setSortTabCategoryIds] = useState<string[]>([]);
  const [sortProductIdsByCategory, setSortProductIdsByCategory] = useState<Record<string, string[]>>({});
  const [sortSnapshotProducts, setSortSnapshotProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedSku, setDebouncedSku] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  /** Image committed when modal opened (for storage cleanup on replace / clear). */
  const initialImageUrlRef = useRef<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImageObjectUrl, setPendingImageObjectUrl] = useState<string | null>(null);

  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: c.id,
  }));
  const sizeFilterOptions = useMemo(
    () => sizeOptions.map((s) => ({ label: s, value: s })),
    [sizeOptions],
  );
  const sizeSuggestions = useMemo(
    () => sizeOptions.map((value) => ({ value })),
    [sizeOptions],
  );

  const watchFilterName = Form.useWatch("filterName", filterForm);
  const watchFilterSku = Form.useWatch("filterSku", filterForm);
  const watchFilterSize = Form.useWatch("filterSize", filterForm);
  const watchFilterCategoryId = Form.useWatch("filterCategoryId", filterForm);
  const bulkStockMode = (Form.useWatch("bulkStockMode", bulkForm) ??
    "set") as BulkStockMode;
  const productKindWatch = Form.useWatch("productKind", form) as
    | ProductKind
    | undefined;
  const watchFormImageUrl = Form.useWatch("imageUrl", form) as string | null | undefined;

  useEffect(() => {
    if (!pendingImageFile) {
      setPendingImageObjectUrl(null);
      return;
    }
    const u = URL.createObjectURL(pendingImageFile);
    setPendingImageObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pendingImageFile]);

  const productImageFileList: UploadFile[] = useMemo(() => {
    if (pendingImageFile && pendingImageObjectUrl) {
      return [
        {
          uid: "pending",
          name: pendingImageFile.name,
          status: "done",
          url: pendingImageObjectUrl,
        },
      ];
    }
    const u = typeof watchFormImageUrl === "string" ? watchFormImageUrl.trim() : "";
    if (u) {
      return [{ uid: "remote", name: "image", status: "done", url: u }];
    }
    return [];
  }, [pendingImageFile, pendingImageObjectUrl, watchFormImageUrl]);

  const sortProductsById = useMemo(
    () => new Map(sortSnapshotProducts.map((p) => [p.id, p])),
    [sortSnapshotProducts],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadSortSnapshot = useCallback(async () => {
    setSortLoading(true);
    try {
      const [plist, clist] = await Promise.all([listProductsAdmin(), listCategoriesAdmin()]);
      setSortSnapshotProducts(plist);
      setCategories(clist);
      const catIdSet = new Set(clist.map((c) => c.id));
      const extraIds = [
        ...new Set(
          plist.map((p) => p.categoryId).filter((id): id is string => Boolean(id && !catIdSet.has(id))),
        ),
      ];
      const orderedCatIds = [
        ...[...clist].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant")).map(
          (c) => c.id,
        ),
        ...extraIds,
      ];
      setSortTabCategoryIds(orderedCatIds);
      setSortProductIdsByCategory(buildProductOrderMap(plist, orderedCatIds));
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.sortLoadError);
      setSortTabCategoryIds([]);
      setSortProductIdsByCategory({});
      setSortSnapshotProducts([]);
    } finally {
      setSortLoading(false);
    }
  }, [message]);

  const onSortDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const aType = active.data.current?.dndType as string | undefined;
      if (aType === "product") {
        const catKey = active.data.current?.categoryKey as string;
        const overType = over.data.current?.dndType;
        const overCat = over.data.current?.categoryKey as string;
        if (overType !== "product" || catKey !== overCat) return;
        const ids = [...(sortProductIdsByCategory[catKey] ?? [])];
        const oldIndex = ids.indexOf(String(active.id));
        const newIndex = ids.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        const prevMap = { ...sortProductIdsByCategory };
        const nextIds = arrayMove(ids, oldIndex, newIndex);
        setSortProductIdsByCategory({ ...prevMap, [catKey]: nextIds });
        try {
          await updateProductsOrder(nextIds);
        } catch (e) {
          message.error(e instanceof Error ? e.message : p.sortProductSaveError);
          setSortProductIdsByCategory(prevMap);
        }
      }
    },
    [message, sortProductIdsByCategory],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedName(
        typeof watchFilterName === "string" ? watchFilterName.trim() : "",
      );
      setDebouncedSku(
        typeof watchFilterSku === "string" ? watchFilterSku.trim() : "",
      );
    }, 300);
    return () => window.clearTimeout(id);
  }, [watchFilterName, watchFilterSku]);

  const listFilters = useMemo((): ProductListFilters => {
    const size =
      typeof watchFilterSize === "string" && watchFilterSize.trim()
        ? watchFilterSize.trim()
        : undefined;
    const categoryId =
      typeof watchFilterCategoryId === "string" && watchFilterCategoryId
        ? watchFilterCategoryId
        : undefined;
    return {
      name: debouncedName || undefined,
      sku: debouncedSku || undefined,
      size,
      categoryId,
    };
  }, [debouncedName, debouncedSku, watchFilterSize, watchFilterCategoryId]);

  const refetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const plist = await listProductsAdmin(listFilters);
      setProducts(plist);
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.loadProductsError);
    } finally {
      setLoading(false);
    }
  }, [listFilters, message]);

  useEffect(() => {
    void refetchProducts();
  }, [refetchProducts]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listCategoriesAdmin(), listDistinctProductSizes()])
      .then(([cats, sizes]) => {
        if (!cancelled) {
          setCategories(cats);
          setSizeOptions(sizes);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          message.error(e instanceof Error ? e.message : p.loadCategoriesError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [message]);

  const resetFilters = () => {
    filterForm.resetFields();
    setDebouncedName("");
    setDebouncedSku("");
  };

  const openCreate = () => {
    initialImageUrlRef.current = null;
    setPendingImageFile(null);
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      nameEn: "",
      description: "",
      size: "",
      sku: "",
      priceDollars: 0,
      stock: 0,
      isActive: true,
      categoryId: categoryOptions[0]?.value,
      productKind: "STANDARD",
      bundleGroups: [],
      imageUrl: null,
    });
    setModalOpen(true);
  };

  const openEdit = (prod: Product) => {
    initialImageUrlRef.current = prod.imageUrl?.trim() ?? null;
    setPendingImageFile(null);
    setEditingId(prod.id);
    form.setFieldsValue({
      categoryId: prod.categoryId ?? undefined,
      name: prod.name,
      nameEn: prod.nameEn ?? "",
      description: prod.description ?? "",
      size: prod.size ?? "",
      sku: prod.sku,
      priceDollars: centsToDollars(prod.price),
      stock: prod.stock,
      isActive: prod.isActive,
      productKind: prod.kind,
      imageUrl: prod.imageUrl ?? null,
      bundleGroups:
        prod.kind === "CUSTOM_BUNDLE" && prod.bundleGroups.length > 0
          ? [...prod.bundleGroups]
              .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
              .map((g) => ({
                name: g.name,
                requiredQty: g.requiredQty,
                productIds: [...g.productIds],
              }))
          : [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    initialImageUrlRef.current = null;
    setPendingImageFile(null);
    form.resetFields();
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (values.productKind === "CUSTOM_BUNDLE") {
        const groups = values.bundleGroups ?? [];
        if (groups.length === 0) {
          message.error(p.bundleGroupsRequired);
          return;
        }
        for (const row of groups) {
          const rq = row?.requiredQty;
          if (rq == null || Number(rq) < 1) {
            message.error(p.bundleGroupRequiredQtyError);
            return;
          }
          const pids = row?.productIds ?? [];
          const uniq = [...new Set(pids.filter(Boolean))];
          if (uniq.length === 0) {
            message.error(p.bundleGroupProductsRequired);
            return;
          }
          if (uniq.length !== pids.length) {
            message.error(p.bundleDuplicateProductInGroup);
            return;
          }
          if (editingId && uniq.includes(editingId)) {
            message.error(p.bundleCannotIncludeSelf);
            return;
          }
        }
      }
      setSaving(true);
      const initialImg = initialImageUrlRef.current;
      const formImg = values.imageUrl?.trim() ? values.imageUrl.trim() : null;

      let resolvedImageUrl: string | null = formImg;

      if (editingId) {
        if (pendingImageFile) {
          try {
            const url = await uploadProductImage(editingId, pendingImageFile);
            resolvedImageUrl = url;
            if (initialImg && initialImg !== url) {
              try {
                await removeProductImageFromUrl(initialImg);
              } catch {
                /* stale object in bucket; ignore */
              }
            }
          } catch {
            message.warning(p.imageUploadFailed);
            resolvedImageUrl = initialImg;
          }
        } else if (initialImg && !formImg) {
          try {
            await removeProductImageFromUrl(initialImg);
          } catch {
            /* ignore */
          }
          resolvedImageUrl = null;
        }
      }

      const input: ProductInput = {
        ...toInput({ ...values, imageUrl: editingId ? resolvedImageUrl : null }),
        imageUrl: editingId ? resolvedImageUrl : null,
      };

      if (editingId) {
        await updateProduct(editingId, input);
        message.success(p.updated);
      } else {
        const created = await createProduct(input);
        if (pendingImageFile) {
          try {
            const url = await uploadProductImage(created.id, pendingImageFile);
            await setProductImageUrl(created.id, url);
          } catch {
            message.warning(p.imageUploadFailed);
          }
        }
        message.success(p.created);
      }
      closeModal();
      await refetchProducts();
      void listDistinctProductSizes()
        .then(setSizeOptions)
        .catch(() => {
          /* ignore */
        });
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : p.saveError);
    } finally {
      setSaving(false);
    }
  };

  const openBulkEdit = () => {
    bulkForm.resetFields();
    bulkForm.setFieldsValue({ bulkStockMode: "set" });
    setBulkModalOpen(true);
  };

  const closeBulkModal = () => {
    setBulkModalOpen(false);
    bulkForm.resetFields();
  };

  const submitBulk = async () => {
    const ids = selectedRowKeys.map(String);
    if (ids.length === 0) {
      message.warning(p.bulkSelectWarn);
      return;
    }

    const categoryTouched = bulkForm.isFieldTouched("bulkCategoryId");
    const sizeTouched = bulkForm.isFieldTouched("bulkSize");
    const priceTouched = bulkForm.isFieldTouched("bulkPriceDollars");
    const stockTouched = bulkForm.isFieldTouched("bulkStockValue");

    if (!categoryTouched && !sizeTouched && !priceTouched && !stockTouched) {
      message.warning(p.bulkFieldWarn);
      return;
    }

    try {
      const values = await bulkForm.validateFields();
      const patch: ProductBulkPatch = {};
      if (categoryTouched) {
        patch.categoryId = values.bulkCategoryId ?? null;
      }
      if (sizeTouched) {
        patch.size = values.bulkSize?.trim() ? values.bulkSize.trim() : null;
      }
      if (priceTouched) {
        if (
          values.bulkPriceDollars == null ||
          Number.isNaN(values.bulkPriceDollars)
        ) {
          message.warning(p.bulkPriceWarn);
          return;
        }
        patch.priceCents = dollarsToCents(values.bulkPriceDollars);
      }
      if (stockTouched) {
        const raw = values.bulkStockValue;
        if (raw == null || Number.isNaN(Number(raw))) {
          message.warning(p.bulkStockWarn);
          return;
        }
        const n = Math.trunc(Number(raw));
        if (values.bulkStockMode === "adjust") {
          patch.stockAdjust = n;
        } else {
          patch.stockSet = Math.max(0, n);
        }
      }

      setBulkSaving(true);
      await bulkPatchProducts(ids, products, patch);
      message.success(p.bulkDone(ids.length));
      closeBulkModal();
      setSelectedRowKeys([]);
      await refetchProducts();
      void listDistinctProductSizes()
        .then(setSizeOptions)
        .catch(() => {
          /* ignore refresh errors */
        });
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : p.bulkError);
    } finally {
      setBulkSaving(false);
    }
  };

  const onDelete = (row: Product) => {
    modal.confirm({
      title: p.deleteTitle,
      content: p.deleteBody(row.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProduct(row.id);
          message.success(p.deleted);
          await refetchProducts();
          void listDistinctProductSizes()
            .then(setSizeOptions)
            .catch(() => {
              /* ignore */
            });
        } catch (e) {
          message.error(e instanceof Error ? e.message : p.deleteError);
        }
      },
    });
  };

  const columns: ColumnsType<Product> = [
    {
      title: p.colName,
      key: "name",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.name}</Text>
          {row.nameEn ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.nameEn}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: p.colType,
      key: "kind",
      width: 108,
      render: (_, row) =>
        row.kind === "CUSTOM_BUNDLE" ? (
          <Tag color="purple">{p.kindCustomBundle}</Tag>
        ) : (
          <Tag>{p.kindStandard}</Tag>
        ),
    },
    {
      title: p.colSize,
      dataIndex: "size",
      key: "size",
      width: 100,
      render: (size: string | null) => (size?.trim() ? size : common.dash),
    },
    { title: p.colSku, dataIndex: "sku", key: "sku", width: 120 },
    {
      title: p.colCategory,
      key: "cat",
      width: 120,
      render: (_, row) => row.categoryName ?? common.dash,
    },
    {
      title: p.colPrice,
      dataIndex: "price",
      key: "price",
      width: 100,
      align: "right",
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: p.colStock,
      dataIndex: "stock",
      key: "stock",
      width: 80,
      align: "right",
    },
    {
      title: p.colActive,
      dataIndex: "isActive",
      key: "active",
      width: 88,
      render: (active: boolean) => (
        <Tag color={active ? "green" : "default"}>
          {active ? common.yes : common.no}
        </Tag>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            {common.edit}
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            {common.delete}
          </Button>
        </Space>
      ),
    },
  ];

  const sortTabContent = (
    <Card loading={sortLoading}>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {p.sortIntro}
      </Text>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void onSortDragEnd(e)}>
        <Title level={5} style={{ marginTop: 0 }}>
          {p.sortSectionProducts}
        </Title>
        {sortTabCategoryIds.map((catId) => {
          const pids = sortProductIdsByCategory[catId] ?? [];
          if (pids.length === 0) return null;
          const cat = categories.find((c) => c.id === catId);
          const label = cat?.name ?? sortProductsById.get(pids[0])?.categoryName ?? catId;
          return (
            <div key={`grp-${catId}`} style={{ marginBottom: 20 }}>
              <Text strong style={{ display: "block", marginBottom: 8 }}>
                {label}
              </Text>
              <SortableContext items={pids} strategy={verticalListSortingStrategy}>
                {pids.map((pid) => {
                  const pr = sortProductsById.get(pid);
                  if (!pr) return null;
                  return <SortableProductOrderRow key={pid} product={pr} categoryKey={catId} />;
                })}
              </SortableContext>
            </div>
          );
        })}
        {(sortProductIdsByCategory[UNCATEGORIZED_SORT_KEY] ?? []).length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {p.sortUncategorized}
            </Text>
            <SortableContext
              items={sortProductIdsByCategory[UNCATEGORIZED_SORT_KEY] ?? []}
              strategy={verticalListSortingStrategy}>
              {(sortProductIdsByCategory[UNCATEGORIZED_SORT_KEY] ?? []).map((pid) => {
                const pr = sortProductsById.get(pid);
                if (!pr) return null;
                return (
                  <SortableProductOrderRow
                    key={pid}
                    product={pr}
                    categoryKey={UNCATEGORIZED_SORT_KEY}
                  />
                );
              })}
            </SortableContext>
          </div>
        ) : null}
      </DndContext>
    </Card>
  );

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
          {p.pageTitle}
        </Title>
        {adminTab === "list" ? (
          <Space>
            <Button
              disabled={selectedRowKeys.length === 0}
              onClick={openBulkEdit}>
              {p.bulkEdit}
            </Button>
            <Button type="primary" onClick={openCreate}>
              {p.newProduct}
            </Button>
          </Space>
        ) : (
          <span />
        )}
      </Space>

      <Tabs
        activeKey={adminTab}
        onChange={(k) => {
          setAdminTab(k);
          if (k === "sort") void loadSortSnapshot();
        }}
        items={[
          {
            key: "list",
            label: p.tabList,
            children: (
              <Card>
                <Form<FilterFormValues>
                  form={filterForm}
                  layout="inline"
                  style={{ marginBottom: 16, rowGap: 8 }}>
                  <Form.Item name="filterName" label={p.filterName}>
                    <Input
                      allowClear
                      placeholder={p.filterNamePh}
                      style={{ width: 168 }}
                    />
                  </Form.Item>
                  <Form.Item name="filterSku" label={p.filterSku}>
                    <Input
                      allowClear
                      placeholder={p.filterSkuPh}
                      style={{ width: 140 }}
                    />
                  </Form.Item>
                  <Form.Item name="filterSize" label={p.filterSize}>
                    <Select
                      allowClear
                      placeholder={p.filterSizeAll}
                      style={{ width: 140 }}
                      options={sizeFilterOptions}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                  <Form.Item name="filterCategoryId" label={p.filterCategory}>
                    <Select
                      allowClear
                      placeholder={p.filterCategoryAll}
                      style={{ width: 180 }}
                      options={categoryOptions}
                      showSearch
                      optionFilterProp="label"
                    />
                  </Form.Item>
                  <Form.Item>
                    <Button htmlType="button" onClick={resetFilters}>
                      {common.reset}
                    </Button>
                  </Form.Item>
                </Form>
                <Table<Product>
                  rowKey="id"
                  loading={loading}
                  columns={columns}
                  dataSource={products}
                  pagination={{ pageSize: 12 }}
                  scroll={{ x: true }}
                  rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                    preserveSelectedRowKeys: true,
                  }}
                />
              </Card>
            ),
          },
          {
            key: "sort",
            label: p.tabSort,
            children: sortTabContent,
          },
        ]}
      />

      <Modal
        title={editingId ? p.modalEdit : p.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={720}
        okText={common.save}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}>
          <Form.Item name="productKind" label={p.labelProductKind}>
            <Radio.Group>
              <Radio value="STANDARD">{p.kindStandard}</Radio>
              <Radio value="CUSTOM_BUNDLE">{p.kindCustomBundle}</Radio>
            </Radio.Group>
          </Form.Item>
          {productKindWatch === "CUSTOM_BUNDLE" ? (
            <Form.Item label={p.labelBundleGroups} required extra={p.bundleGroupsExtra}>
              <Form.List name="bundleGroups">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: "100%" }} size="middle">
                    {fields.map(({ key, name, ...restField }) => (
                      <Card key={key} size="small" style={{ width: "100%" }}>
                        <Space
                          direction="vertical"
                          style={{ width: "100%" }}
                          size="small">
                          <Space
                            style={{ width: "100%", flexWrap: "wrap" }}
                            align="baseline">
                            <Form.Item
                              {...restField}
                              name={[name, "name"]}
                              label={p.bundleGroupName}
                              style={{ flex: "1 1 160px", marginBottom: 0, minWidth: 140 }}>
                              <Input placeholder={p.bundleGroupNamePh} />
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, "requiredQty"]}
                              label={p.labelBundleGroupRequiredQty}
                              rules={[
                                { required: true, type: "number", min: 1, message: common.required },
                              ]}
                              extra={p.bundleGroupRequiredQtyPh}
                              style={{ width: 160, marginBottom: 0 }}>
                              <InputNumber min={1} step={1} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                            <MinusCircleOutlined
                              onClick={() => remove(name)}
                              style={{ color: "#ff4d4f", cursor: "pointer", marginTop: 30 }}
                            />
                          </Space>
                          <Form.Item
                            {...restField}
                            name={[name, "productIds"]}
                            label={p.bundleGroupProducts}
                            rules={[
                              {
                                validator: async (_, v) => {
                                  if (!Array.isArray(v) || v.length === 0) {
                                    throw new Error(p.bundleGroupProductsRequired);
                                  }
                                },
                              },
                            ]}>
                            <ProductSelect
                              multiple
                              allowClear
                              placeholder={p.bundleGroupProductsPh}
                              products={products}
                              kinds={["STANDARD"]}
                              excludeProductIds={editingId ? [editingId] : []}
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                        </Space>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      {p.bundleAddGroup}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          ) : null}
          <Form.Item
            name="name"
            label={p.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nameEn" label={p.labelNameEn}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={p.labelDescription}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="imageUrl" hidden>
            <Input type="hidden" />
          </Form.Item>
          <Form.Item label={p.labelImage} extra={p.imageExtra}>
            <Upload
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              listType="picture-card"
              maxCount={1}
              fileList={productImageFileList}
              beforeUpload={(file) => {
                setPendingImageFile(file);
                return false;
              }}
              onRemove={() => {
                if (pendingImageFile) {
                  setPendingImageFile(null);
                  return true;
                }
                form.setFieldsValue({ imageUrl: null });
                return true;
              }}>
              {productImageFileList.length >= 1 ? null : (
                <button type="button" className="ant-btn ant-btn-default">
                  <UploadOutlined /> {p.imageUploadPick}
                </button>
              )}
            </Upload>
          </Form.Item>
          <Form.Item name="size" label={p.labelSize}>
            <Input placeholder={p.sizePh} />
          </Form.Item>
          <Form.Item
            name="sku"
            label={p.labelSku}
            rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="priceDollars"
            label={p.labelPrice}
            rules={[{ required: true, type: "number", min: 0 }]}
            extra={p.priceExtra}>
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="stock"
            label={p.labelStock}
            rules={[{ required: true, type: "number", min: 0 }]}
            extra={
              productKindWatch === "CUSTOM_BUNDLE"
                ? p.stockBundleExtra
                : undefined
            }>
            <InputNumber
              min={0}
              step={1}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="categoryId" label={p.labelCategory}>
            <Select
              allowClear
              placeholder={p.categoryPh}
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={p.labelActive}
            valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={p.bulkTitle(selectedRowKeys.length)}
        open={bulkModalOpen}
        onCancel={closeBulkModal}
        onOk={() => void submitBulk()}
        confirmLoading={bulkSaving}
        destroyOnClose
        width={520}
        okText={p.bulkApply}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {p.bulkHint}
        </Typography.Paragraph>
        <Form<BulkFormValues>
          form={bulkForm}
          layout="vertical"
          initialValues={{ bulkStockMode: "set" }}>
          <Form.Item name="bulkCategoryId" label={p.bulkCategory}>
            <Select
              allowClear
              placeholder={p.bulkCategoryPh}
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="bulkSize" label={p.bulkSize}>
            <AutoComplete
              allowClear
              placeholder={p.bulkSizePh}
              options={sizeSuggestions}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="bulkPriceDollars"
            label={p.bulkPrice}
            extra={p.bulkPriceExtra}>
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              style={{ width: "100%" }}
              placeholder={p.bulkPricePh}
            />
          </Form.Item>

          <Divider plain style={{ margin: "8px 0 12px" }}>
            {p.bulkStockTitle}
          </Divider>
          <Form.Item name="bulkStockMode" label={p.bulkStockModeLabel}>
            <Radio.Group>
              <Radio value="set">{p.bulkStockSet}</Radio>
              <Radio value="adjust">{p.bulkStockAdjust}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="bulkStockValue"
            label={
              bulkStockMode === "adjust"
                ? p.bulkStockValueAdjustLabel
                : p.bulkStockValueSetLabel
            }
            extra={p.bulkStockExtra}>
            <InputNumber
              step={1}
              precision={0}
              min={bulkStockMode === "set" ? 0 : undefined}
              style={{ width: "100%" }}
              placeholder={p.bulkStockPh}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
