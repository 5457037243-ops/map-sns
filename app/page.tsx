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
      const popupText = place.memo
        ? `${place.title}\n${place.memo}`
        : place.title

      const popup = new mapboxgl.Popup({ offset: 25 }).setText(popupText)

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
        console.error(error)
        alert('ピンの読み込みに失敗しました')
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
    })

    return () => {
      map.remove()
    }
  }, [])

  const savePlace = async () => {
    if (!selectedPoint) return

    if (!title) {
      alert('場所名を入力してください')
      return
    }

    const { data, error } = await supabase
      .from('places')
      .insert({
        title: title,
        memo: memo,
        latitude: selectedPoint.latitude,
        longitude: selectedPoint.longitude,
      })
      .select()
      .single()

    if (error) {
  alert(`保存に失敗しました: ${error.message}`)
  console.log('保存エラー:', error)
  return
}

    setPlaces((currentPlaces) => [data, ...currentPlaces])

    const map = mapRef.current
    if (map) {
      const popupText = data.memo
        ? `${data.title}\n${data.memo}`
        : data.title

      const popup = new mapboxgl.Popup({ offset: 25 }).setText(popupText)

      new mapboxgl.Marker()
        .setLngLat([data.longitude, data.latitude])
        .setPopup(popup)
        .addTo(map)
    }

    setSelectedPoint(null)
    setTitle('')
    setMemo('')
  }

  const cancelForm = () => {
    setSelectedPoint(null)
    setTitle('')
    setMemo('')
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
          width: '340px',
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
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                border: '1px solid #ccc',
                borderRadius: '6px',
              }}
            />

            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモ"
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                border: '1px solid #ccc',
                borderRadius: '6px',
              }}
            />

            <button
              onClick={savePlace}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '8px',
                border: 'none',
                borderRadius: '6px',
                background: '#111',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              保存
            </button>

            <button
              onClick={cancelForm}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '6px',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
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
            <strong>📍 {place.title}</strong>
            {place.memo && (
              <p style={{ margin: '6px 0 0', color: '#666', fontSize: '13px' }}>
                {place.memo}
              </p>
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