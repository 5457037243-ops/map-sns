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

  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)

  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [category, setCategory] = useState('')
  const [era, setEra] = useState('')
  const [architect, setArchitect] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [rating, setRating] = useState(3)

  useEffect(() => {
    if (!mapContainer.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [139.7, 35.6],
      zoom: 10,
    })

    mapRef.current = map

    const addMarker = (place: Place) => {
      const popupHtml = `
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

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml)

      const marker = new mapboxgl.Marker()
        .setLngLat([place.longitude, place.latitude])
        .setPopup(popup)
        .addTo(map)

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
        setPlaces((currentPlaces) =>
          currentPlaces.filter((p) => p.id !== place.id)
        )
      })
    }

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
      data.forEach((place) => addMarker(place))
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
      map.remove()
    }
  }, [])

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

    const map = mapRef.current
    if (map) {
      const popupHtml = `
        <div style="max-width: 220px;">
          ${data.image_url ? `<img src="${data.image_url}" style="width:100%; border-radius:8px; margin-bottom:8px;" />` : ''}
          <strong>${data.title}</strong>
          ${data.category ? `<p>カテゴリー：${data.category}</p>` : ''}
          ${data.era ? `<p>年代：${data.era}</p>` : ''}
          ${data.architect ? `<p>設計者：${data.architect}</p>` : ''}
          ${data.rating ? `<p>評価：${'★'.repeat(data.rating)}</p>` : ''}
          ${data.memo ? `<p>${data.memo}</p>` : ''}
        </div>
      `

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(popupHtml)

      new mapboxgl.Marker()
        .setLngLat([data.longitude, data.latitude])
        .setPopup(popup)
        .addTo(map)
    }

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

        {places.length === 0 && (
          <p style={{ color: '#666' }}>まだピンがありません</p>
        )}

        {places.map((place) => (
          <button
            key={place.id}
            onClick={() => moveToPlace(place)}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              marginBottom: '8px',
              textAlign: 'left',
              border: '1px solid #ddd',
              borderRadius: '8px',
              background: '#fafafa',
              cursor: 'pointer',
            }}
          >
            {place.image_url && (
              <img
                src={place.image_url}
                alt={place.title}
                style={{
                  width: '100%',
                  height: '120px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  marginBottom: '8px',
                }}
              />
            )}

            <strong>📍 {place.title}</strong>

            {place.category && (
              <p style={smallTextStyle}>カテゴリー：{place.category}</p>
            )}

            {place.era && (
              <p style={smallTextStyle}>年代：{place.era}</p>
            )}

            {place.architect && (
              <p style={smallTextStyle}>設計者：{place.architect}</p>
            )}

            {place.rating && (
              <p style={smallTextStyle}>評価：{'★'.repeat(place.rating)}</p>
            )}

            {place.memo && (
              <p style={smallTextStyle}>{place.memo}</p>
            )}
          </button>
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