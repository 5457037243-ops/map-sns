'use client'

import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

type Place = {
  id: string
  title: string
  memo: string | null
  category: string | null
  era: string | null
  architect: string | null
  image_url: string | null
  rating: number | null
  latitude: number
  longitude: number
}

type SelectedPoint = {
  latitude: number
  longitude: number
}

export default function Home() {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)

  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState('')
  const [era, setEra] = useState('')
  const [architect, setArchitect] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [rating, setRating] = useState(3)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortType, setSortType] = useState('newest')

  const filteredPlaces = places
  .filter((place) => {
    if (!selectedCategory) return true
    return place.category === selectedCategory
  })
  .filter((place) => {
    if (!searchText) return true

    const text = searchText.toLowerCase()

    return (
      place.title?.toLowerCase().includes(text) ||
      place.memo?.toLowerCase().includes(text) ||
      place.architect?.toLowerCase().includes(text)
    )
  })
  .sort((a, b) => {
    if (sortType === 'rating') {
      return (b.rating || 0) - (a.rating || 0)
    }

    if (sortType === 'era') {
      return (a.era || '').localeCompare(b.era || '')
    }

    return 0
  })

  const createPopupHtml = (place: Place) => {
    return `
      <div style="max-width: 220px;">
        ${place.image_url ? `<img src="${place.image_url}" style="width:100%; border-radius:8px; margin-bottom:8px;" />` : ''}
        <strong>${place.title}</strong>
        ${place.category ? `<p>カテゴリー：${place.category}</p>` : ''}
        ${place.era ? `<p>年代：${place.era}</p>` : ''}
        ${place.architect ? `<p>設計者：${place.architect}</p>` : ''}
        ${place.rating ? `<p>評価：${'★'.repeat(place.rating)}</p>` : ''}
        ${place.memo ? `<p>${place.memo}</p>` : ''}
      </div>
    `
  }

  const addMarker = (place: Place) => {
    const map = mapRef.current
    if (!map) return

    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(createPopupHtml(place))

    const marker = new mapboxgl.Marker()
      .setLngLat([place.longitude, place.latitude])
      .setPopup(popup)
      .addTo(map)

    markersRef.current.push(marker)

    marker.getElement().addEventListener('click', (ev) => {
      ev.stopPropagation()
      marker.togglePopup()
    })

    marker.getElement().addEventListener('dblclick', async (ev) => {
      ev.stopPropagation()

      const ok = window.confirm('このピンを削除しますか？')
      if (!ok) return

      const { error } = await supabase
        .from('places')
        .delete()
        .eq('id', place.id)

      if (error) {
        alert(`削除に失敗しました: ${error.message}`)
        return
      }

      marker.remove()
      markersRef.current = markersRef.current.filter((m) => m !== marker)
      setPlaces((currentPlaces) =>
        currentPlaces.filter((p) => p.id !== place.id)
      )
    })
  }

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [139.7, 35.6],
      zoom: 10,
    })

    mapRef.current = map

    const loadPlaces = async () => {
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        alert(`読み込みに失敗しました: ${error.message}`)
        return
      }

      setPlaces(data)
    }

    loadPlaces()

    let isDragging = false

    map.on('mousedown', () => {
      isDragging = false
    })

    map.on('mousemove', () => {
      isDragging = true
    })

    map.on('click', (e) => {
      if (isDragging) return

      setSelectedPoint({
        latitude: e.lngLat.lat,
        longitude: e.lngLat.lng,
      })

      setTitle('')
      setMemo('')
      setCategory('')
      setEra('')
      setArchitect('')
      setImageFile(null)
      setRating(3)
    })

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    filteredPlaces.forEach((place) => {
      addMarker(place)
    })
  }, [places, selectedCategory])

  const uploadImage = async () => {
    if (!imageFile) return ''

    const originalExt = imageFile.name.split('.').pop()
    const fileExt = originalExt ? originalExt.toLowerCase() : 'jpg'
    const safeFileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`

    const { error } = await supabase.storage
      .from('place-images')
      .upload(safeFileName, imageFile)

    if (error) {
      alert(`画像アップロードに失敗しました: ${error.message}`)
      return ''
    }

    const { data } = supabase.storage
      .from('place-images')
      .getPublicUrl(safeFileName)

    return data.publicUrl
  }

  const savePlace = async () => {
    if (!selectedPoint) return

    if (!title) {
      alert('場所名を入力してください')
      return
    }

    const imageUrl = await uploadImage()

    const { data, error } = await supabase
      .from('places')
      .insert({
        title,
        memo,
        category,
        era,
        architect,
        image_url: imageUrl,
        rating,
        latitude: selectedPoint.latitude,
        longitude: selectedPoint.longitude,
      })
      .select()
      .single()

    if (error) {
      alert(`保存に失敗しました: ${error.message}`)
      return
    }

    setPlaces((currentPlaces) => [data, ...currentPlaces])

    setSelectedPoint(null)
    setTitle('')
    setMemo('')
    setCategory('')
    setEra('')
    setArchitect('')
    setImageFile(null)
    setRating(3)
  }

  const cancelForm = () => {
    setSelectedPoint(null)
    setTitle('')
    setMemo('')
    setCategory('')
    setEra('')
    setArchitect('')
    setImageFile(null)
    setRating(3)
  }

  const moveToPlace = (place: Place) => {
    mapRef.current?.flyTo({
      center: [place.longitude, place.latitude],
      zoom: 15,
    })
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      <div
        style={{
          width: '360px',
          padding: '16px',
          borderRight: '1px solid #ddd',
          background: '#fff',
          overflowY: 'auto',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
  My Map
</h1>

{/* 🔍 検索 */}
<input
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  placeholder="場所名・メモ・建築家で検索"
  style={inputStyle}
/>

{/* 🔽 並び替え */}
<select
  value={sortType}
  onChange={(e) => setSortType(e.target.value)}
  style={inputStyle}
>
  <option value="newest">新しい順</option>
  <option value="rating">評価が高い順</option>
  <option value="era">年代順</option>
</select>

{/* 🏷 カテゴリ */}
<select
  value={selectedCategory}
  onChange={(e) => setSelectedCategory(e.target.value)}
  style={inputStyle}
>
          <option value="">すべて表示</option>
          <option value="建築">建築</option>
          <option value="都市構造">都市構造</option>
          <option value="カフェ">カフェ</option>
          <option value="公園">公園</option>
          <option value="産業遺産">産業遺産</option>
          <option value="ショップ">ショップ</option>
          <option value="イベント">イベント</option>
          <option value="その他">その他</option>
        </select>

        {selectedPoint && (
          <div
            style={{
              padding: '12px',
              marginBottom: '16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              background: '#fafafa',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
              新しい場所を追加
            </h2>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="場所名"
              style={inputStyle}
            />

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            >
              <option value="">カテゴリー選択</option>
              <option value="建築">建築</option>
              <option value="都市構造">都市構造</option>
              <option value="カフェ">カフェ</option>
              <option value="公園">公園</option>
              <option value="産業遺産">産業遺産</option>
              <option value="ショップ">ショップ</option>
              <option value="イベント">イベント</option>
              <option value="その他">その他</option>
            </select>

            <input
              value={era}
              onChange={(e) => setEra(e.target.value)}
              placeholder="年代（例：1960年代）"
              style={inputStyle}
            />

            <input
              value={architect}
              onChange={(e) => setArchitect(e.target.value)}
              placeholder="建築家 / 設計者"
              style={inputStyle}
            />

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモ・社会背景・環境メモ"
              rows={4}
              style={inputStyle}
            />

            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              style={inputStyle}
            />

            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              style={inputStyle}
            >
              <option value={1}>★1</option>
              <option value={2}>★2</option>
              <option value={3}>★3</option>
              <option value={4}>★4</option>
              <option value={5}>★5</option>
            </select>

            <button onClick={savePlace} style={saveButtonStyle}>
              保存
            </button>

            <button onClick={cancelForm} style={cancelButtonStyle}>
              キャンセル
            </button>
          </div>
        )}

        {filteredPlaces.length === 0 && (
          <p style={{ color: '#666' }}>まだピンがありません</p>
        )}

                {filteredPlaces.map((place) => (
          <div
            key={place.id}
            onClick={() => moveToPlace(place)}
            style={{
              width: '100%',
              marginBottom: '16px',
              border: '1px solid #e5e5e5',
              borderRadius: '16px',
              background: '#fff',
              overflow: 'hidden',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            {place.image_url && (
              <img
                src={place.image_url}
                alt={place.title}
                style={{
                  width: '100%',
                  height: '200px',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            )}

            <div style={{ padding: '12px' }}>
              <strong style={{ fontSize: '16px' }}>📍 {place.title}</strong>

              <div style={{ marginTop: '8px' }}>
                {place.category && <span style={tagStyle}>{place.category}</span>}
                {place.era && <span style={tagStyle}>{place.era}</span>}
                {place.rating && <span style={tagStyle}>{'★'.repeat(place.rating)}</span>}
              </div>

              {place.architect && (
                <p style={smallTextStyle}>設計者：{place.architect}</p>
              )}

              {place.memo && (
                <p style={{ ...smallTextStyle, lineHeight: '1.5' }}>
                  {place.memo}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        ref={mapContainer}
        style={{ flex: 1, height: '100vh' }}
      />
    </div>
  )
}
const inputStyle = {
  width: '100%',
  padding: '8px',
  marginBottom: '8px',
  border: '1px solid #ccc',
  borderRadius: '6px',
}

const saveButtonStyle = {
  width: '100%',
  padding: '10px',
  marginBottom: '8px',
  border: 'none',
  borderRadius: '6px',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
}

const cancelButtonStyle = {
  width: '100%',
  padding: '10px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  background: '#fff',
  cursor: 'pointer',
}

const smallTextStyle = {
  margin: '6px 0 0',
  color: '#666',
  fontSize: '13px',
}

const tagStyle = {
  display: 'inline-block',
  padding: '4px 8px',
  marginRight: '6px',
  marginBottom: '6px',
  borderRadius: '999px',
  background: '#f1f1f1',
  color: '#333',
  fontSize: '12px',
}