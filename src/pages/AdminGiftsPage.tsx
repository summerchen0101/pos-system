import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import {
  createGift,
  listGiftsAdmin,
  setGiftStock,
  updateGift,
  type AdminGift,
} from '../api/giftsAdmin'
import { zhtw } from '../locales/zhTW'

const { Title, Text } = Typography
const g = zhtw.admin.gifts
const common = zhtw.common

type FormValues = {
  name: string
  isActive: boolean
  initialStock: number
}

export function AdminGiftsPage() {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [gifts, setGifts] = useState<AdminGift[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [stockModalGift, setStockModalGift] = useState<AdminGift | null>(null)
  const [stockValue, setStockValue] = useState<number>(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const gList = await listGiftsAdmin()
      setGifts(gList)
    } catch (e) {
      message.error(e instanceof Error ? e.message : g.loadError)
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      name: '',
      isActive: true,
      initialStock: 0,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    form.resetFields()
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await createGift({
        name: values.name,
        isActive: values.isActive,
        initialStock: values.initialStock,
      })
      message.success(g.created)
      closeModal()
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : g.saveError)
    } finally {
      setSaving(false)
    }
  }

  const onToggleActive = async (row: AdminGift, active: boolean) => {
    try {
      await updateGift(row.id, { isActive: active })
      message.success(active ? g.activated : g.deactivated)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : g.updateError)
    }
  }

  const openStockModal = (row: AdminGift) => {
    setStockModalGift(row)
    setStockValue(row.stock)
  }

  const saveStock = async () => {
    if (!stockModalGift) return
    try {
      await setGiftStock(stockModalGift.id, stockValue)
      message.success(g.stockUpdated)
      setStockModalGift(null)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : g.saveError)
    }
  }

  const columns: ColumnsType<AdminGift> = [
    {
      title: g.colName,
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: g.colStock,
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      align: 'right',
      render: (stock: number, row) => (
        <Button type="link" size="small" onClick={() => openStockModal(row)} style={{ padding: 0 }}>
          {stock}
        </Button>
      ),
    },
    {
      title: g.colActive,
      dataIndex: 'isActive',
      key: 'active',
      width: 100,
      render: (active: boolean, row) => (
        <Switch checked={active} onChange={(v) => void onToggleActive(row, v)} />
      ),
    },
  ]

  return (
    <div className="admin-page admin-gifts">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            {g.pageTitle}
          </Title>
          <Button type="primary" onClick={openCreate}>
            {g.newGift}
          </Button>
        </Space>

        <Card>
          <Table<AdminGift>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={gifts}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </Space>

      <Modal
        title={g.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submitCreate()}
        confirmLoading={saving}
        destroyOnClose
        okText={common.save}
      >
        <Form<FormValues> form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label={g.labelName} rules={[{ required: true, message: common.required }]}>
            <Input placeholder={g.namePh} />
          </Form.Item>
          <Form.Item
            name="initialStock"
            label={g.labelInitialStock}
            rules={[{ required: true, type: 'number', min: 0 }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label={g.colActive} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={g.stockModalTitle}
        open={stockModalGift != null}
        onCancel={() => setStockModalGift(null)}
        onOk={() => void saveStock()}
        okText={common.save}
      >
        <p style={{ marginBottom: 12 }}>
          <Tag>{stockModalGift?.name}</Tag>
        </p>
        <InputNumber
          min={0}
          precision={0}
          style={{ width: '100%' }}
          value={stockValue}
          onChange={(v) => setStockValue(v ?? 0)}
        />
      </Modal>
    </div>
  )
}
