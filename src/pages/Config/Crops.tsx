import { useState } from 'react'
import type { JSX } from 'react'
import { Plus, Edit2, Trash2, Leaf, TrendingUp } from 'lucide-react'
import type { Crop } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn, formatNumber } from '@/lib/utils'

// Global crops database
const globalCrops: Crop[] = [
  {
    id: 'crop-soja',
    company_id: null,
    name: 'Soja',
    kc_ini: 0.4,
    kc_mid: 1.15,
    kc_final: 0.5,
    total_cycle_days: 110,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'crop-milho',
    company_id: null,
    name: 'Milho',
    kc_ini: 0.3,
    kc_mid: 1.2,
    kc_final: 0.4,
    total_cycle_days: 140,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'crop-feijao',
    company_id: null,
    name: 'Feijão',
    kc_ini: 0.4,
    kc_mid: 1.0,
    kc_final: 0.6,
    total_cycle_days: 90,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'crop-algodao',
    company_id: null,
    name: 'Algodão',
    kc_ini: 0.35,
    kc_mid: 1.25,
    kc_final: 0.7,
    total_cycle_days: 160,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'crop-cana',
    company_id: null,
    name: 'Cana-de-açúcar',
    kc_ini: 0.4,
    kc_mid: 1.3,
    kc_final: 0.8,
    total_cycle_days: 360,
    created_at: '2026-01-01T00:00:00Z',
  },
]

const mockCustomCrops: Crop[] = [
  {
    id: 'crop-custom-1',
    company_id: 'company-1',
    name: 'Soja Transgênica BRS',
    kc_ini: 0.42,
    kc_mid: 1.18,
    kc_final: 0.52,
    total_cycle_days: 115,
    created_at: '2026-02-01T00:00:00Z',
  },
]

interface FormData {
  name: string
  kcIni: string
  kcMid: string
  kcFinal: string
  totalCycleDays: string
}

const initialFormData: FormData = {
  name: '',
  kcIni: '',
  kcMid: '',
  kcFinal: '',
  totalCycleDays: '',
}

function SimpleSparkline({ values }: { values: number[] }): JSX.Element {
  if (!values || values.length === 0) {
    return <span className="text-text-muted text-xs">N/A</span>
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  // Create small sparkline-like visualization
  const normalized = values.map((v) => ((v - min) / range) * 100)

  return (
    <div className="flex items-end gap-0.5 h-6">
      {normalized.slice(0, 5).map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary-400 rounded-t opacity-75 hover:opacity-100 transition-opacity"
          style={{ height: `${Math.max(v, 20)}%` }}
          title={`${formatNumber(values[i])}`}
        />
      ))}
    </div>
  )
}

export function Crops() {
  const [customCrops, setCustomCrops] = useState<Crop[]>(mockCustomCrops)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showGlobal, setShowGlobal] = useState(true)

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleAddCrop = () => {
    if (
      !formData.name ||
      !formData.kcIni ||
      !formData.kcMid ||
      !formData.kcFinal
    ) {
      alert('Por favor, preencha todos os campos de Kc')
      return
    }

    if (editingId) {
      // Update existing crop
      setCustomCrops((prev) =>
        prev.map((crop) =>
          crop.id === editingId
            ? {
                ...crop,
                name: formData.name,
                kc_ini: parseFloat(formData.kcIni),
                kc_mid: parseFloat(formData.kcMid),
                kc_final: parseFloat(formData.kcFinal),
                total_cycle_days: formData.totalCycleDays
                  ? parseInt(formData.totalCycleDays)
                  : null,
              }
            : crop
        )
      )
    } else {
      // Create new crop
      const newCrop: Crop = {
        id: `crop-custom-${Date.now()}`,
        company_id: 'company-1',
        name: formData.name,
        kc_ini: parseFloat(formData.kcIni),
        kc_mid: parseFloat(formData.kcMid),
        kc_final: parseFloat(formData.kcFinal),
        total_cycle_days: formData.totalCycleDays
          ? parseInt(formData.totalCycleDays)
          : null,
        created_at: new Date().toISOString(),
      }
      setCustomCrops((prev) => [newCrop, ...prev])
    }

    setFormData(initialFormData)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEditCrop = (crop: Crop) => {
    setFormData({
      name: crop.name,
      kcIni: crop.kc_ini?.toString() || '',
      kcMid: crop.kc_mid?.toString() || '',
      kcFinal: crop.kc_final?.toString() || '',
      totalCycleDays: crop.total_cycle_days?.toString() || '',
    })
    setEditingId(crop.id)
    setIsModalOpen(true)
  }

  const handleDeleteCrop = (id: string) => {
    setCustomCrops((prev) => prev.filter((crop) => crop.id !== id))
    setDeleteConfirmId(null)
  }

  const renderCropCard = (crop: Crop, isGlobal: boolean) => (
    <Card key={crop.id} className={cn(
      'flex flex-col h-full',
      isGlobal && 'border-2 border-primary-200 opacity-75'
    )}>
      <CardContent className="flex-1 space-y-4">
        <div className="flex items-start gap-2">
          <Leaf className={cn(
            'h-5 w-5 mt-1 flex-shrink-0',
            isGlobal ? 'text-primary-400' : 'text-primary-500'
          )} />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text">{crop.name}</h3>
            {isGlobal && (
              <p className="text-xs text-text-muted font-medium mt-1">
                Cultura Global
              </p>
            )}
          </div>
        </div>

        {crop.total_cycle_days && (
          <div>
            <p className="text-xs text-text-muted font-medium uppercase">
              Ciclo Total
            </p>
            <p className="text-sm text-text mt-1 font-semibold">
              {formatNumber(crop.total_cycle_days)} dias
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-border space-y-3">
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-text-muted font-medium uppercase">
                Curva Kc
              </p>
              <span className="text-xs text-text-muted">
                Ini: {crop.kc_ini ? formatNumber(crop.kc_ini) : '—'}
              </span>
            </div>
            <SimpleSparkline
              values={[
                crop.kc_ini ?? 0,
                ((crop.kc_ini ?? 0) + (crop.kc_mid ?? 0)) / 2,
                crop.kc_mid ?? 0,
                ((crop.kc_mid ?? 0) + (crop.kc_final ?? 0)) / 2,
                crop.kc_final ?? 0,
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-text-muted font-medium">Kc Ini</p>
              <p className="text-sm text-text font-semibold mt-1">
                {crop.kc_ini ? formatNumber(crop.kc_ini) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted font-medium">Kc Mid</p>
              <p className="text-sm text-text font-semibold mt-1">
                {crop.kc_mid ? formatNumber(crop.kc_mid) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted font-medium">Kc Fin</p>
              <p className="text-sm text-text font-semibold mt-1">
                {crop.kc_final ? formatNumber(crop.kc_final) : '—'}
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      {!isGlobal && (
        <div className="flex gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={() => handleEditCrop(crop)}
          >
            <Edit2 className="h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="flex-1 flex items-center justify-center gap-2"
            onClick={() => setDeleteConfirmId(crop.id)}
          >
            <Trash2 className="h-4 w-4" />
            Deletar
          </Button>
        </div>
      )}
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Culturas</h1>
          <p className="text-text-muted mt-1">
            Configure culturas e coeficientes de evapotranspiração (Kc)
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
          Nova Cultura
        </Button>
      </div>

      {/* Toggle Global/Custom */}
      <div className="flex gap-2">
        <Button
          variant={showGlobal ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowGlobal(true)}
        >
          Culturas Globais
        </Button>
        <Button
          variant={!showGlobal ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowGlobal(false)}
        >
          Meus Culturas ({customCrops.length})
        </Button>
      </div>

      {/* Crops Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {showGlobal ? (
          globalCrops.map((crop) => renderCropCard(crop, true))
        ) : (
          <>
            {customCrops.length === 0 && (
              <div className="col-span-full py-12 text-center">
                <Leaf className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
                <p className="text-text-muted">
                  Você ainda não criou culturas personalizadas
                </p>
              </div>
            )}
            {customCrops.map((crop) => renderCropCard(crop, false))}
          </>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader
              title={editingId ? 'Editar Cultura' : 'Nova Cultura'}
            />
            <CardContent className="space-y-4">
              <Input
                label="Nome da Cultura"
                placeholder="Soja Transgênica BRS"
                value={formData.name}
                onChange={(e) =>
                  handleFormChange('name', e.currentTarget.value)
                }
              />

              <div className="pt-2 border-t border-border">
                <h4 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Coeficientes de Cultivo (Kc)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Kc Inicial (Estágio 1)"
                    variant="number"
                    placeholder="0.40"
                    step="0.01"
                    min="0"
                    max="2"
                    value={formData.kcIni}
                    onChange={(e) =>
                      handleFormChange('kcIni', e.currentTarget.value)
                    }
                    helperText="Coeficiente no início do ciclo"
                  />
                  <Input
                    label="Kc Médio (Pico)"
                    variant="number"
                    placeholder="1.15"
                    step="0.01"
                    min="0"
                    max="2"
                    value={formData.kcMid}
                    onChange={(e) =>
                      handleFormChange('kcMid', e.currentTarget.value)
                    }
                    helperText="Coeficiente na cobertura máxima"
                  />
                  <Input
                    label="Kc Final (Maturação)"
                    variant="number"
                    placeholder="0.50"
                    step="0.01"
                    min="0"
                    max="2"
                    value={formData.kcFinal}
                    onChange={(e) =>
                      handleFormChange('kcFinal', e.currentTarget.value)
                    }
                    helperText="Coeficiente na maturação"
                  />
                </div>
              </div>

              <Input
                label="Ciclo Total (dias)"
                variant="number"
                placeholder="110"
                min="1"
                value={formData.totalCycleDays}
                onChange={(e) =>
                  handleFormChange('totalCycleDays', e.currentTarget.value)
                }
                helperText="Duração total da safra em dias (opcional)"
              />

              {/* Kc Curve Preview */}
              {formData.kcIni && formData.kcMid && formData.kcFinal && (
                <Card className="bg-surface-secondary border-0">
                  <CardContent className="space-y-3">
                    <p className="text-xs text-text-muted font-medium uppercase">
                      Prévia da Curva Kc
                    </p>
                    <SimpleSparkline
                      values={[
                        parseFloat(formData.kcIni),
                        (parseFloat(formData.kcIni) +
                          parseFloat(formData.kcMid)) /
                          2,
                        parseFloat(formData.kcMid),
                        (parseFloat(formData.kcMid) +
                          parseFloat(formData.kcFinal)) /
                          2,
                        parseFloat(formData.kcFinal),
                      ]}
                    />
                  </CardContent>
                </Card>
              )}

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
                <Button onClick={handleAddCrop}>
                  {editingId ? 'Atualizar' : 'Criar'} Cultura
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
                Tem certeza que deseja deletar esta cultura? Esta ação não pode
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
                  onClick={() => handleDeleteCrop(deleteConfirmId)}
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
