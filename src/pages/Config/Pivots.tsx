import { useState } from 'react'
import { Plus, Edit2, Trash2, Droplets } from 'lucide-react'
import type { Pivot, Farm } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { cn, formatNumber } from '@/lib/utils'

// Mock farms
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

// Mock pivots
const mockPivots: Pivot[] = [
  {
    id: 'pivot-1',
    farm_id: 'farm-1',
    name: 'Pivô 01 - Talhão A',
    flow_rate_m3h: 150,
    emitter_spacing_m: 1.5,
    first_emitter_spacing_m: 2.0,
    last_tower_length_m: 45,
    overhang_length_m: 5,
    last_tower_speed_mh: 12,
    cuc_percent: 88,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'pivot-2',
    farm_id: 'farm-1',
    name: 'Pivô 02 - Talhão B',
    flow_rate_m3h: 140,
    emitter_spacing_m: 1.5,
    first_emitter_spacing_m: 2.0,
    last_tower_length_m: 42,
    overhang_length_m: 4,
    last_tower_speed_mh: 10,
    cuc_percent: 85,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'pivot-3',
    farm_id: 'farm-2',
    name: 'Pivô 01 - Expansão',
    flow_rate_m3h: 130,
    emitter_spacing_m: 1.5,
    first_emitter_spacing_m: 2.0,
    last_tower_length_m: 40,
    overhang_length_m: 3.5,
    last_tower_speed_mh: 9,
    cuc_percent: 86,
    created_at: '2026-01-20T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
  },
]

interface FormData {
  farmId: string
  name: string
  flowRate: string
  emitterSpacing: string
  firstEmitterSpacing: string
  lastTowerLength: string
  overhangLength: string
  lastTowerSpeed: string
  cuc: string
}

const initialFormData: FormData = {
  farmId: 'farm-1',
  name: '',
  flowRate: '',
  emitterSpacing: '',
  firstEmitterSpacing: '',
  lastTowerLength: '',
  overhangLength: '',
  lastTowerSpeed: '',
  cuc: '',
}

export function Pivots() {
  const [pivots, setPivots] = useState<Pivot[]>(mockPivots)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedFarmId, setSelectedFarmId] = useState<string>('farm-1')

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddPivot = () => {
    if (!formData.name || !formData.flowRate) {
      alert('Por favor, preencha os campos obrigatórios')
      return
    }

    if (editingId) {
      // Update existing pivot
      setPivots((prev) =>
        prev.map((pivot) =>
          pivot.id === editingId
            ? {
                ...pivot,
                farm_id: formData.farmId,
                name: formData.name,
                flow_rate_m3h: parseFloat(formData.flowRate),
                emitter_spacing_m: formData.emitterSpacing
                  ? parseFloat(formData.emitterSpacing)
                  : null,
                first_emitter_spacing_m: formData.firstEmitterSpacing
                  ? parseFloat(formData.firstEmitterSpacing)
                  : null,
                last_tower_length_m: formData.lastTowerLength
                  ? parseFloat(formData.lastTowerLength)
                  : null,
                overhang_length_m: formData.overhangLength
                  ? parseFloat(formData.overhangLength)
                  : null,
                last_tower_speed_mh: formData.lastTowerSpeed
                  ? parseFloat(formData.lastTowerSpeed)
                  : null,
                cuc_percent: formData.cuc ? parseFloat(formData.cuc) : null,
                updated_at: new Date().toISOString(),
              }
            : pivot
        )
      )
    } else {
      // Create new pivot
      const newPivot: Pivot = {
        id: Date.now().toString(),
        farm_id: formData.farmId,
        name: formData.name,
        flow_rate_m3h: parseFloat(formData.flowRate),
        emitter_spacing_m: formData.emitterSpacing
          ? parseFloat(formData.emitterSpacing)
          : null,
        first_emitter_spacing_m: formData.firstEmitterSpacing
          ? parseFloat(formData.firstEmitterSpacing)
          : null,
        last_tower_length_m: formData.lastTowerLength
          ? parseFloat(formData.lastTowerLength)
          : null,
        overhang_length_m: formData.overhangLength
          ? parseFloat(formData.overhangLength)
          : null,
        last_tower_speed_mh: formData.lastTowerSpeed
          ? parseFloat(formData.lastTowerSpeed)
          : null,
        cuc_percent: formData.cuc ? parseFloat(formData.cuc) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setPivots((prev) => [newPivot, ...prev])
    }

    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEditPivot = (pivot: Pivot) => {
    setFormData({
      farmId: pivot.farm_id,
      name: pivot.name,
      flowRate: pivot.flow_rate_m3h?.toString() || '',
      emitterSpacing: pivot.emitter_spacing_m?.toString() || '',
      firstEmitterSpacing: pivot.first_emitter_spacing_m?.toString() || '',
      lastTowerLength: pivot.last_tower_length_m?.toString() || '',
      overhangLength: pivot.overhang_length_m?.toString() || '',
      lastTowerSpeed: pivot.last_tower_speed_mh?.toString() || '',
      cuc: pivot.cuc_percent?.toString() || '',
    })
    setEditingId(pivot.id)
    setIsModalOpen(true)
  }

  const handleDeletePivot = (id: string) => {
    setPivots((prev) => prev.filter((pivot) => pivot.id !== id))
    setDeleteConfirmId(null)
  }

  const getFarmName = (farmId: string): string => {
    return mockFarms.find((f) => f.id === farmId)?.name || 'Fazenda desconhecida'
  }

  const filteredPivots = pivots.filter((p) => p.farm_id === selectedFarmId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Pivôs Centrais</h1>
          <p className="text-text-muted mt-1">
            Gerencie os pivôs e suas configurações técnicas
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingId(null)
            setFormData({ ...initialFormData, farmId: selectedFarmId })
            setIsModalOpen(true)
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Novo Pivô
        </Button>
      </div>

      {/* Farm Filter */}
      <Select
        label="Filtrar por Fazenda"
        options={mockFarms.map((f) => ({ value: f.id, label: f.name }))}
        value={selectedFarmId}
        onChange={(e) => setSelectedFarmId(e.currentTarget.value)}
      />

      {/* Pivots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPivots.map((pivot) => (
          <Card key={pivot.id} className="flex flex-col">
            <CardContent className="flex-1 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-text">
                  {pivot.name}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {getFarmName(pivot.farm_id)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Droplets className="h-4 w-4 text-primary-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-text-muted font-medium uppercase">
                      Vazão
                    </p>
                    <p className="text-sm text-text mt-1 font-semibold">
                      {pivot.flow_rate_m3h
                        ? formatNumber(pivot.flow_rate_m3h)
                        : '—'}{' '}
                      m³/h
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-text-muted font-medium uppercase">
                    Espaçamento de Emissores
                  </p>
                  <p className="text-sm text-text mt-1">
                    {pivot.emitter_spacing_m
                      ? formatNumber(pivot.emitter_spacing_m)
                      : '—'}{' '}
                    m
                  </p>
                </div>

                <div>
                  <p className="text-xs text-text-muted font-medium uppercase">
                    Comprimento Última Torre
                  </p>
                  <p className="text-sm text-text mt-1">
                    {pivot.last_tower_length_m
                      ? formatNumber(pivot.last_tower_length_m)
                      : '—'}{' '}
                    m
                  </p>
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <div>
                    <p className="text-xs text-text-muted font-medium uppercase">
                      Vão em Balanço
                    </p>
                    <p className="text-sm text-text mt-1">
                      {pivot.overhang_length_m
                        ? formatNumber(pivot.overhang_length_m)
                        : '—'}{' '}
                      m
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-muted font-medium uppercase">
                      Velocidade Última Torre
                    </p>
                    <p className="text-sm text-text mt-1">
                      {pivot.last_tower_speed_mh
                        ? formatNumber(pivot.last_tower_speed_mh)
                        : '—'}{' '}
                      m/h
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-muted font-medium uppercase">
                      CUC (%)
                    </p>
                    <p className="text-sm text-text font-semibold mt-1">
                      {pivot.cuc_percent ? formatNumber(pivot.cuc_percent) : '—'}
                      %
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 flex items-center justify-center gap-2"
                onClick={() => handleEditPivot(pivot)}
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1 flex items-center justify-center gap-2"
                onClick={() => setDeleteConfirmId(pivot.id)}
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
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader
              title={editingId ? 'Editar Pivô' : 'Novo Pivô'}
            />
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Fazenda"
                  options={mockFarms.map((f) => ({ value: f.id, label: f.name }))}
                  value={formData.farmId}
                  onChange={(e) =>
                    handleFormChange('farmId', e.currentTarget.value)
                  }
                  className="sm:col-span-2"
                />

                <Input
                  label="Nome do Pivô"
                  placeholder="Pivô 01 - Talhão A"
                  value={formData.name}
                  onChange={(e) =>
                    handleFormChange('name', e.currentTarget.value)
                  }
                  className="sm:col-span-2"
                />

                <Input
                  label="Vazão (m³/h)"
                  variant="number"
                  placeholder="150"
                  step="0.1"
                  value={formData.flowRate}
                  onChange={(e) =>
                    handleFormChange('flowRate', e.currentTarget.value)
                  }
                />

                <Input
                  label="Espaçamento Emissores (m)"
                  variant="number"
                  placeholder="1.5"
                  step="0.1"
                  value={formData.emitterSpacing}
                  onChange={(e) =>
                    handleFormChange('emitterSpacing', e.currentTarget.value)
                  }
                />

                <Input
                  label="Espaçamento Primeiro Emissor (m)"
                  variant="number"
                  placeholder="2.0"
                  step="0.1"
                  value={formData.firstEmitterSpacing}
                  onChange={(e) =>
                    handleFormChange('firstEmitterSpacing', e.currentTarget.value)
                  }
                />

                <Input
                  label="Comprimento Última Torre (m)"
                  variant="number"
                  placeholder="45"
                  step="0.1"
                  value={formData.lastTowerLength}
                  onChange={(e) =>
                    handleFormChange('lastTowerLength', e.currentTarget.value)
                  }
                />

                <Input
                  label="Vão em Balanço (m)"
                  variant="number"
                  placeholder="5"
                  step="0.1"
                  value={formData.overhangLength}
                  onChange={(e) =>
                    handleFormChange('overhangLength', e.currentTarget.value)
                  }
                />

                <Input
                  label="Velocidade Última Torre (m/h)"
                  variant="number"
                  placeholder="12"
                  step="0.1"
                  value={formData.lastTowerSpeed}
                  onChange={(e) =>
                    handleFormChange('lastTowerSpeed', e.currentTarget.value)
                  }
                />

                <Input
                  label="CUC (%)"
                  variant="number"
                  placeholder="88"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.cuc}
                  onChange={(e) =>
                    handleFormChange('cuc', e.currentTarget.value)
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
                <Button onClick={handleAddPivot}>
                  {editingId ? 'Atualizar' : 'Criar'} Pivô
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
                Tem certeza que deseja deletar este pivô? Esta ação não pode ser
                desfeita.
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
                  onClick={() => handleDeletePivot(deleteConfirmId)}
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
