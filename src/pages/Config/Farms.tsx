import { useState } from 'react'
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react'
import type { Farm } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { cn, formatNumber } from '@/lib/utils'

// Mock data
const mockFarms: Farm[] = [
  {
    id: 'farm-1',
    company_id: 'company-1',
    name: 'Fazenda Principal',
    latitude_degrees: 14,
    latitude_minutes: 14,
    hemisphere: 'S',
    altitude: 450,
    area_m2: 500000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'farm-2',
    company_id: 'company-1',
    name: 'Fazenda Expansão',
    latitude_degrees: 15,
    latitude_minutes: 30,
    hemisphere: 'S',
    altitude: 380,
    area_m2: 300000,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
]

interface FormData {
  name: string
  latitudeDegrees: string
  latitudeMinutes: string
  hemisphere: 'N' | 'S'
  altitude: string
  area: string
}

const initialFormData: FormData = {
  name: '',
  latitudeDegrees: '',
  latitudeMinutes: '',
  hemisphere: 'S',
  altitude: '',
  area: '',
}

export function Farms() {
  const [farms, setFarms] = useState<Farm[]>(mockFarms)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddFarm = () => {
    if (!formData.name || !formData.latitudeDegrees || !formData.altitude) {
      alert('Por favor, preencha os campos obrigatórios')
      return
    }

    if (editingId) {
      // Update existing farm
      setFarms((prev) =>
        prev.map((farm) =>
          farm.id === editingId
            ? {
                ...farm,
                name: formData.name,
                latitude_degrees: parseFloat(formData.latitudeDegrees),
                latitude_minutes: parseFloat(formData.latitudeMinutes) || null,
                hemisphere: formData.hemisphere,
                altitude: parseFloat(formData.altitude),
                area_m2: parseFloat(formData.area) * 10000 || null, // Convert hectares to m²
                updated_at: new Date().toISOString(),
              }
            : farm
        )
      )
    } else {
      // Create new farm
      const newFarm: Farm = {
        id: Date.now().toString(),
        company_id: 'company-1',
        name: formData.name,
        latitude_degrees: parseFloat(formData.latitudeDegrees),
        latitude_minutes: parseFloat(formData.latitudeMinutes) || null,
        hemisphere: formData.hemisphere,
        altitude: parseFloat(formData.altitude),
        area_m2: parseFloat(formData.area) * 10000 || null, // Convert hectares to m²
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setFarms((prev) => [newFarm, ...prev])
    }

    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEditFarm = (farm: Farm) => {
    setFormData({
      name: farm.name,
      latitudeDegrees: farm.latitude_degrees?.toString() || '',
      latitudeMinutes: farm.latitude_minutes?.toString() || '',
      hemisphere: farm.hemisphere || 'S',
      altitude: farm.altitude?.toString() || '',
      area: farm.area_m2 ? (farm.area_m2 / 10000).toString() : '',
    })
    setEditingId(farm.id)
    setIsModalOpen(true)
  }

  const handleDeleteFarm = (id: string) => {
    setFarms((prev) => prev.filter((farm) => farm.id !== id))
    setDeleteConfirmId(null)
  }

  const formatArea = (area_m2: number | null): string => {
    if (!area_m2) return '—'
    const hectares = area_m2 / 10000
    return `${formatNumber(hectares)} ha`
  }

  const formatCoordinates = (
    latDeg: number | null,
    latMin: number | null,
    hemisphere: string | null
  ): string => {
    if (!latDeg) return '—'
    return `${latDeg}°${latMin ? latMin : '0'}' ${hemisphere || 'S'}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Fazendas</h1>
          <p className="text-text-muted mt-1">
            Gerencie as propriedades e suas áreas de irrigação
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null)
            setFormData(initialFormData)
            setIsModalOpen(true)
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Nova Fazenda
        </Button>
      </div>

      {/* Farms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {farms.map((farm) => (
          <Card key={farm.id} className="flex flex-col">
            <CardContent className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-text">
                  {farm.name}
                </h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-primary-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-text-muted font-medium uppercase">
                      Localização
                    </p>
                    <p className="text-sm text-text mt-1">
                      {formatCoordinates(
                        farm.latitude_degrees,
                        farm.latitude_minutes,
                        farm.hemisphere
                      )}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-text-muted font-medium uppercase">
                    Altitude
                  </p>
                  <p className="text-sm text-text mt-1">
                    {farm.altitude ? formatNumber(farm.altitude) : '—'} m
                  </p>
                </div>

                <div>
                  <p className="text-xs text-text-muted font-medium uppercase">
                    Área
                  </p>
                  <p className="text-sm text-text font-semibold mt-1">
                    {formatArea(farm.area_m2)}
                  </p>
                </div>
              </div>
            </CardContent>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 flex items-center justify-center gap-2"
                onClick={() => handleEditFarm(farm)}
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1 flex items-center justify-center gap-2"
                onClick={() => setDeleteConfirmId(farm.id)}
              >
                <Trash2 className="h-4 w-4" />
                Deletar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader
              title={
                editingId ? 'Editar Fazenda' : 'Nova Fazenda'
              }
            />
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nome da Fazenda"
                  placeholder="Fazenda Principal"
                  value={formData.name}
                  onChange={(e) =>
                    handleFormChange('name', e.currentTarget.value)
                  }
                  className="sm:col-span-2"
                />

                <Input
                  label="Latitude (Graus)"
                  variant="number"
                  placeholder="14"
                  value={formData.latitudeDegrees}
                  onChange={(e) =>
                    handleFormChange('latitudeDegrees', e.currentTarget.value)
                  }
                />

                <Input
                  label="Latitude (Minutos)"
                  variant="number"
                  placeholder="14"
                  step="0.1"
                  value={formData.latitudeMinutes}
                  onChange={(e) =>
                    handleFormChange('latitudeMinutes', e.currentTarget.value)
                  }
                />

                <Select
                  label="Hemisfério"
                  options={[
                    { value: 'N', label: 'Norte (N)' },
                    { value: 'S', label: 'Sul (S)' },
                  ]}
                  value={formData.hemisphere}
                  onChange={(e) =>
                    handleFormChange(
                      'hemisphere',
                      e.currentTarget.value as 'N' | 'S'
                    )
                  }
                />

                <Input
                  label="Altitude (m)"
                  variant="number"
                  placeholder="450"
                  value={formData.altitude}
                  onChange={(e) =>
                    handleFormChange('altitude', e.currentTarget.value)
                  }
                />

                <Input
                  label="Área (hectares)"
                  variant="number"
                  placeholder="50"
                  step="0.1"
                  value={formData.area}
                  onChange={(e) =>
                    handleFormChange('area', e.currentTarget.value)
                  }
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-4 border-t border-border">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false)
                    setFormData(initialFormData)
                    setEditingId(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleAddFarm}>
                  {editingId ? 'Atualizar' : 'Criar'} Fazenda
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader title="Confirmar Exclusão" />
            <CardContent className="space-y-4">
              <p className="text-sm text-text">
                Tem certeza que deseja deletar esta fazenda? Esta ação não pode
                ser desfeita.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteFarm(deleteConfirmId)}
                >
                  Deletar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
