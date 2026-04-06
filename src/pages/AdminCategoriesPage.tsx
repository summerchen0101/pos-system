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
import { HolderOutlined } from "@ant-design/icons";
import { App, Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Tag, Typography } from "antd";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  createCategory,
  deleteCategory,
  listCategoriesAdmin,
  updateCategoriesOrder,
  updateCategory,
  type CategoryInput,
} from "../api/categoriesAdmin";
import { zhtw } from "../locales/zhTW";
import type { Category } from "../types/pos";

const { Title, Text } = Typography;
const c = zhtw.admin.categories;
const common = zhtw.common;

type FormValues = {
  name: string;
  sortOrder: number;
  isActive: boolean;
};

function toInput(values: FormValues): CategoryInput {
  return {
    name: values.name,
    sortOrder: values.sortOrder,
    isActive: values.isActive,
  };
}

function SortableCategoryRow(props: {
  category: Category;
  position: number;
  onEdit: (row: Category) => void;
  onDelete: (row: Category) => void;
}) {
  const { category: row, position, onEdit, onDelete } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: isDragging ? "0 6px 20px rgba(0,0,0,0.2)" : undefined,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    marginBottom: 8,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
  };
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong>{row.name}</Text>
        <Text type="secondary" style={{ marginLeft: 10 }}>
          #{position}
        </Text>
      </div>
      <Tag color={row.isActive ? "green" : "default"} style={{ flexShrink: 0 }}>
        {row.isActive ? common.yes : common.no}
      </Tag>
      <Space style={{ flexShrink: 0 }}>
        <Button type="link" size="small" onClick={() => onEdit(row)}>
          {common.edit}
        </Button>
        <Button type="link" size="small" danger onClick={() => onDelete(row)}>
          {common.delete}
        </Button>
      </Space>
    </div>
  );
}

export function AdminCategoriesPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCategoriesAdmin();
      setCategories(list);
    } catch (e) {
      message.error(e instanceof Error ? e.message : c.loadError);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (categories.length === 0) {
      setOrderedIds([]);
      return;
    }
    setOrderedIds(
      [...categories]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"))
        .map((x) => x.id),
    );
  }, [categories]);

  const categoryById = useCallback(
    (id: string) => categories.find((x) => x.id === id),
    [categories],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || String(active.id) === String(over.id)) return;
      const oldIndex = orderedIds.indexOf(String(active.id));
      const newIndex = orderedIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const prev = [...orderedIds];
      const next = arrayMove(orderedIds, oldIndex, newIndex);
      setOrderedIds(next);
      try {
        await updateCategoriesOrder(next);
        await load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : c.sortSaveError);
        setOrderedIds(prev);
      }
    },
    [orderedIds, load, message],
  );

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id);
    form.setFieldsValue({
      name: cat.name,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingId) {
        await updateCategory(editingId, toInput(values as FormValues));
        message.success(c.updated);
      } else {
        await createCategory({
          name: values.name,
          sortOrder: 0,
          isActive: values.isActive,
        });
        message.success(c.created);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : c.saveError);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row: Category) => {
    modal.confirm({
      title: c.deleteTitle,
      content: <span>{c.deleteBody(row.name)}</span>,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCategory(row.id);
          message.success(c.deleted);
          await load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : c.deleteError);
        }
      },
    });
  };

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {c.pageTitle}
        </Title>
        <Button type="primary" onClick={openCreate}>
          {c.newCategory}
        </Button>
      </Space>

      <Card loading={loading}>
        <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          {c.sortIntro}
        </Text>
        {!loading && orderedIds.length === 0 ? (
          <Text type="secondary">尚無分類，請新增。</Text>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {orderedIds.map((id, index) => {
                  const row = categoryById(id);
                  if (!row) return null;
                  return (
                    <SortableCategoryRow
                      key={id}
                      category={row}
                      position={index + 1}
                      onEdit={openEdit}
                      onDelete={onDelete}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Modal
        title={editingId ? c.modalEdit : c.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={480}
        okText={common.save}>
        <Form<FormValues> form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label={c.colName} rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          {editingId ? (
            <Form.Item
              name="sortOrder"
              label={c.colSort}
              rules={[{ required: true, type: "number", message: common.required }]}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  亦可在列表拖曳調整順序；拖曳成功後會覆寫此數字。
                </Text>
              }>
              <InputNumber min={0} step={1} style={{ width: "100%" }} />
            </Form.Item>
          ) : (
            <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
              新增的分類會自動排到最後；之後可在列表拖曳調整。
            </Text>
          )}
          <Form.Item name="isActive" label={c.colActive} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
