'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Loader2, MapPin, Plus, Pencil, Trash2, Search } from 'lucide-react'
import {
  listCostEstimateZones,
  listCostEstimateLandmarks,
  createCostEstimateZone,
  updateCostEstimateZone,
  deleteCostEstimateZone,
  createCostEstimateLandmark,
  updateCostEstimateLandmark,
  deleteCostEstimateLandmark,
  type CostEstimateZoneRow,
  type CostEstimateLandmarkRow,
} from './actions'

type Tab = 'zones' | 'landmarks'

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50'
const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50'

export default function CostEstimateLandmarksPage() {
  const [tab, setTab] = useState<Tab>('landmarks')
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState<CostEstimateZoneRow[]>([])
  const [landmarks, setLandmarks] = useState<CostEstimateLandmarkRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [z, l] = await Promise.all([listCostEstimateZones(), listCostEstimateLandmarks()])
    if (!z.ok) {
      setError(z.error)
      setLoading(false)
      return
    }
    if (!l.ok) {
      setError(l.error)
      setLoading(false)
      return
    }
    setZones(z.rows)
    setLandmarks(l.rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredLandmarks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return landmarks
    return landmarks.filter((row) => {
      const hay = [
        row.name,
        row.area,
        row.zone_code,
        row.aliases.join(' '),
        String(row.lat),
        String(row.lng),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [landmarks, search])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <MapPin className="h-8 w-8 text-blue-600" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cost estimate landmarks</h1>
            <p className="text-sm text-gray-600 mt-1">
              Zones and landmarks used by the cost-estimates Edge Function for named-place matching.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('landmarks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'landmarks'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Landmarks
        </button>
        <button
          type="button"
          onClick={() => setTab('zones')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'zones'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Zones
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-600 py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading…
        </div>
      ) : tab === 'zones' ? (
        <ZonesSection zones={zones} onRefresh={load} />
      ) : (
        <LandmarksSection
          zones={zones}
          landmarks={filteredLandmarks}
          search={search}
          onSearchChange={setSearch}
          onRefresh={load}
        />
      )}
    </div>
  )
}

function ZonesSection({
  zones,
  onRefresh,
}: {
  zones: CostEstimateZoneRow[]
  onRefresh: () => Promise<void>
}) {
  const [newCode, setNewCode] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newSort, setNewSort] = useState(100)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CostEstimateZoneRow | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    const res = await createCostEstimateZone({
      code: newCode,
      label: newLabel,
      sort_order: newSort,
    })
    setSaving(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setNewCode('')
    setNewLabel('')
    setNewSort(100)
    await onRefresh()
  }

  async function handleDelete(code: string) {
    if (!confirm(`Delete zone ${code}? Landmarks must not reference it.`)) return
    const res = await deleteCostEstimateZone(code)
    if (!res.ok) {
      alert(res.error)
      return
    }
    await onRefresh()
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Add zone</h2>
        <p className="text-sm text-gray-600">
          Code is used in pricing and APIs (e.g. CENTRAL). Use uppercase letters, numbers, underscores.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
            <input
              className={inputClass}
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="EAST_BANK"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <input
              className={inputClass}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="East Bank Demerara"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
            <input
              type="number"
              className={inputClass}
              value={newSort}
              onChange={(e) => setNewSort(Number(e.target.value))}
            />
          </div>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add zone
        </button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Code</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Label</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Sort</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {zones.map((z) => (
              <tr key={z.code} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-900">{z.code}</td>
                <td className="px-4 py-3 text-gray-800">{z.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{z.sort_order}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setEditing(z)}
                    aria-label={`Edit ${z.code}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={`${btnSecondary} text-red-700 border-red-200 hover:bg-red-50`}
                    onClick={() => void handleDelete(z.code)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditZoneModal
          zone={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onRefresh()
          }}
        />
      )}
    </div>
  )
}

function EditZoneModal({
  zone,
  onClose,
  onSaved,
}: {
  zone: CostEstimateZoneRow
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [label, setLabel] = useState(zone.label)
  const [sortOrder, setSortOrder] = useState(zone.sort_order)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    const res = await updateCostEstimateZone(zone.code, { label, sort_order: sortOrder })
    setSaving(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold">Edit zone {zone.code}</h3>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
            <input
              type="number"
              className={inputClass}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LandmarksSection({
  zones,
  landmarks,
  search,
  onSearchChange,
  onRefresh,
}: {
  zones: CostEstimateZoneRow[]
  landmarks: CostEstimateLandmarkRow[]
  search: string
  onSearchChange: (v: string) => void
  onRefresh: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [area, setArea] = useState('')
  const [zoneCode, setZoneCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CostEstimateLandmarkRow | null>(null)

  useEffect(() => {
    if (zones.length && !zoneCode) {
      setZoneCode(zones[0].code)
    }
  }, [zones, zoneCode])

  async function handleDeleteLandmark(row: CostEstimateLandmarkRow) {
    if (!confirm(`Delete landmark “${row.name}”?`)) return
    const res = await deleteCostEstimateLandmark(row.id)
    if (!res.ok) {
      alert(res.error)
      return
    }
    await onRefresh()
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const latN = parseFloat(lat)
    const lngN = parseFloat(lng)
    setSaving(true)
    const res = await createCostEstimateLandmark({
      name,
      aliases,
      lat: latN,
      lng: lngN,
      area,
      zone_code: zoneCode,
    })
    setSaving(false)
    if (!res.ok) {
      setFormError(res.error)
      return
    }
    setName('')
    setAliases('')
    setLat('')
    setLng('')
    setArea('')
    await onRefresh()
  }

  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="search"
          className={`${inputClass} pl-10`}
          placeholder="Search landmarks…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search landmarks"
        />
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      >
        <h2 className="text-lg font-semibold text-gray-900">Add landmark</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Aliases (comma or newline separated)
            </label>
            <textarea
              className={`${inputClass} min-h-[72px] font-mono text-xs`}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="stabroek&#10;water street market"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
            <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
            <select
              className={inputClass}
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
              required
            >
              {zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.code} — {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button type="submit" className={btnPrimary} disabled={saving || zones.length === 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add landmark
        </button>
        {zones.length === 0 && (
          <p className="text-sm text-amber-700">Create at least one zone before adding landmarks.</p>
        )}
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Area</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Zone</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Aliases</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Coords</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {landmarks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No landmarks yet. Add one above, or adjust your search.
                </td>
              </tr>
            ) : (
              landmarks.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.area}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.zone_code}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={row.aliases.join(', ')}>
                    {row.aliases.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono tabular-nums whitespace-nowrap">
                    {row.lat.toFixed(4)}, {row.lng.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => setEditing(row)}
                      aria-label={`Edit ${row.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`${btnSecondary} text-red-700 border-red-200 hover:bg-red-50`}
                      onClick={() => void handleDeleteLandmark(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditLandmarkModal
          zones={zones}
          landmark={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onRefresh()
          }}
        />
      )}
    </div>
  )
}

function EditLandmarkModal({
  zones,
  landmark,
  onClose,
  onSaved,
}: {
  zones: CostEstimateZoneRow[]
  landmark: CostEstimateLandmarkRow
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(landmark.name)
  const [aliases, setAliases] = useState(landmark.aliases.join('\n'))
  const [lat, setLat] = useState(String(landmark.lat))
  const [lng, setLng] = useState(String(landmark.lng))
  const [area, setArea] = useState(landmark.area)
  const [zoneCode, setZoneCode] = useState(landmark.zone_code)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    const latN = parseFloat(lat)
    const lngN = parseFloat(lng)
    setSaving(true)
    const res = await updateCostEstimateLandmark(landmark.id, {
      name,
      aliases,
      lat: latN,
      lng: lngN,
      area,
      zone_code: zoneCode,
    })
    setSaving(false)
    if (!res.ok) {
      setErr(res.error)
      return
    }
    await onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 my-8">
        <h3 className="text-lg font-semibold">Edit landmark</h3>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Aliases</label>
            <textarea
              className={`${inputClass} min-h-[80px] font-mono text-xs`}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
              <input className={inputClass} value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
              <input className={inputClass} value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Area</label>
            <input className={inputClass} value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zone</label>
            <select
              className={inputClass}
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
            >
              {zones.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.code} — {z.label}
                </option>
              ))}
            </select>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
