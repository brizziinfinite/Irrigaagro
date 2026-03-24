import { useState } from 'react'
import {
  Plus,
  Edit2,
  Trash2,
  Calendar,
  ToggleLeft,
  AlertCircle,
} from 'lucide-react'
import type { Season, Farm, Pivot } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { cn, formatDate, formatNumber } from '@/lib/utils'

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
]

const mockSeasons: Season[] = [
  {
    id: 'season-1',
    farm_id: 'farm-1',
    pivot_id: 'pivot-1',
    name: 'Safra 2025/26 - Soja',
    is_active: true,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'season-2',
    farm_id: 'farm-1',
    pivot_id: 'pivot-2',
    name: 'Safra 2025/26 - Milho',
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'season-3',
    farm_id: 'farm-2',
    pivot_id: null,
    name: 'Safra 2025/26 - Soja',
    is_active: false,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
]

interface FormData {
  farmId: string
  pivotId: string
  name: string
  plantingDate: string
  stage1Duration: string
  stage2Duration: string
  stage3Duration: string
  stage4Duration: string
  kcIni: string
  kcMid: string
  kcFinal: string
}

const initialFormData: FormData = {
  farmId: 'farm-1',
  pivotId: '',
  name: '',
  plantingDate: '',
  stage1Duration: '15',
  stage2Duration: '25',
  stage3Duration: '40',
  stage4Duration: '30',
  kcIni: '0.4',
  kcMid: '1.15',
  kcFinal: '0.5',
}

export function Seasons() {
  const [seasons, setSeasons] = useState<Season[]>(mockSeasons)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddSeason = () => {
    if (!formData.name || !formData.farmId) {
      alert('Por favor, preencha os campos obrigatórios')
      return
    }

    if (editingId) {
      // Update existing season
      setSeasons((prev) =>
        prev.map((season) =>
          season.id === editingId
            ? {
                ...season,
                farm_id: formData.farmId,
                pivot_id: formData.pivotId || null,
                name: formData.name,
                updated_at: new Date().toISOString(),
              }
            : season
        )
      )
    } else {
      // Create new season
      const newSeason: Season = {
        id: Date.now().toString(),
        farm_id: formData.farmId,
        pivot_id: formData.pivotId || null,
        name: formData.name,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setSeasons((prev) => [newSeason, ...prev])
    }

    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEditSeason = (season: Season) => {
    setFormData({
      ...initialFormData,
      farmId: season.farm_id,
      pivotId: season.pivot_id || '',
      name: season.name,
    })
    setEditingId(season.id)
    setIsModalOpen(true)
  }

  const handleDeleteSeason = (id: string) => {
    setSeasons((prev) => prev.filter((season) => season.id !== id))
    setDeleteConfirmId(null)
  }

  const handleToggleActive = (id: string) => {
    setSeasons((prev) =>
      prev.map((season) =>
        season.id === id
          ? { ...season, is_active: !season.is_active }
          : season
      )
    )
  }

  const getFarmName = (farmId: string): string => {
    return mockFarms.find((f) => f.id === farmId)?.name || 'Fazenda desconhecida'
  }

  const getPivotName = (pivotId: string | null): string => {
    if (!pivotId) return '—'
    return mockPivots.find((p) => p.id === pivotId)?.name || 'Pivô desconhecido'
  }

  const availablePivots = mockPivots.filter(
    (p) => p.farm_id === formData.farmId
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Safras</h1>
          <p className="text-text-muted mt-1">
            Gerencie as safras e suas configurações de solo e cultivo
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
          Nova Safra
        </Button>
      </div>

      {/* Seasons Grid */}
      <div className="grid grid-cols-1 gap-4">
        {seasons.map((season) => (
          <Card key={season.id} className={cn(
            'border-2',
            season.is_active
              ? 'border-primary-300 bg-primary-50'
              : 'border-border opacity-75'
          )}>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-text">
                      {season.name}
                    </h3>
                    {season.is_active && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 border border-green-300 text-xs font-medium">
                        <span className="h-2 w-2 bg-green-500 rounded-full" />
                        Ativa
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-text-muted font-medium uppercase">
                        Fazenda
                      </p>
                      <p className="text-sm text-text mt-1">
                        {getFarmName(season.farm_id)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-text-muted font-medium uppercase">
                        Pivô
                      </p>
                      <p className="text-sm text-text mt-1">
                        {getPivotName(season.pivot_id)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-text-muted font-medium uppercase">
                        Data de Criação
                      </p>
                      <p className="text-sm text-text mt-1">
                        {formatDate(season.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant={season.is_active ? 'secondary' : 'outline'}
                    size="sm"
                    className="flex items-center justify-center gap-2 whitespace-nowrap"
                    onClick={() => handleToggleActive(season.id)}
                  >
                    <ToggleLeft className="h-4 w-4" />
                    {season.is_active ? 'Desativar' : 'Ativar'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center justify-center gap-2"
                    onClick={() => handleEditSeason(season)}
                  >
                    <Edit2 className="h-4 w-4" />
                    Editar
                  </Button>

                  <Button
                    variant="danger"
                    size="sm"
                    className="flex items-center justify-center gap-2"
                    onClick={() => setDeleteConfirmId(season.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Deletar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader
              title={editingId ? 'Editar Safra' : 'Nova Safra'}
            />
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-900">
                  Preencha os dados básicos da safra. Os parâmetros de solo e
                  cultivo podem ser configurados após criação.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Fazenda"
                  options={mockFarms.map((f) => ({ value: f.id, label: f.name }))}
                  value={formData.farmId}
                  onChange={(e) => {
                    handleFormChange('farmId', e.currentTarget.value)
                    handleFormChange('pivotId', '')
                  }}
                  className="sm:col-span-2"
                />

                <Select
                  label="Pivô (Opcional)"
                  options={[
                    { value: '', label: 'Nenhum pivô' },
                    ...availablePivots.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                  value={formData.pivotId}
                  onChange={(e) =>
                    handleFormChange('pivotId', e.currentTarget.value)
                  }
                  className="sm:col-span-2"
                />

                <Input
                  label="Nome da Safra"
                  placeholder="Safra 2025/26 - Soja"
                  value={formData.name}
                  onChange={(e) =>
                    handleFormChange('name', e.currentTarget.value)
                  }
                  className="sm:col-span-2"
                />
              </div>

              <div className="pt-2 border-t border-border">
                <h4 className="text-sm font-semibold text-text mb-3">
                  Duração dos Estágios (dias)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input
                    label="Estágio 1"
                    variant="number"
                    placeholder="15"
                    value={formData.stage1Duration}
                    onChange={(e) =>
                      handleFormChange('stage1Duration', e.currentTarget.value)
                    }
                  />
                  <Input
                    label="Estágio 2"
                    variant="number"
                    placeholder="25"
                    value={formData.stage2Duration}
                    onChange={(e) =>
                      handleFormChange('stage2Duration', e.currentTarget.value)
                    }
                  />
                  <Input
                    label="Estágio 3"
                    variant="number"
                    placeholder="40"
                    value={formData.stage3Duration}
                    onChange={(e) =>
                      handleFormChange('stage3Duration', e.currentTarget.value)
                    }
                  />
                  <Input
                    label="Estágio 4"
                    variant="number"
                    placeholder="30"
                    value={formData.stage4Duration}
                    onChange={(e) =>
                      handleFormChange('stage4Duration', e.currentTarget.value)
                    }
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <h4 className="text-sm font-semibold text-text mb-3">
                  Coeficientes de Cultivo (Kc)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Kc Inicial"
                    variant="number"
                    placeholder="0.4"
                    step="0.01"
                    value={formData.kcIni}
                    onChange={(e) =>
                      handleFormChange('kcIni', e.currentTarget.value)
                    }
                  />
                  <Input
                    label="Kc Médio"
                    variant="number"
                    placeholder="1.15"
                    step="0.01"
                    value={formData.kcMid}
                    onChange={(e) =>
                      handleFormChange('kcMid', e.currentTarget.value)
                    }
                  />
                  <Input
                    label="Kc Final"
                    variant="number"
                    placeholder="0.5"
                    step="0.01"
                    value={formData.kcFinal}
                    onChange={(e) =>
                      handleFormChange('kcFinal', e.currentTarget.value)
                    }
                  />
                </div>
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
                <Button onClick={handleAddSeason}>
                  {editingId ? 'Atualizar' : 'Criar'} Safra
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
                Tem certeza que deseja deletar esta safra? Todos os registros
                diários associados serão afetados.
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
                  onClick={() => handleDeleteSeason(deleteConfirmId)}
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
