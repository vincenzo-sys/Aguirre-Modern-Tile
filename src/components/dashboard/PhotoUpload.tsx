'use client'

import { useState, useRef } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'

interface PhotoUploadProps {
  files: File[]
  onChange: (files: File[]) => void
}

export default function PhotoUpload({ files, onChange }: PhotoUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/')
    )
    onChange([...files, ...droppedFiles])
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const selected = Array.from(e.target.files)
      onChange([...files, ...selected])
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <Upload className="w-8 h-8 mx-auto text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Drag & drop photos here, or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-400">JPG, PNG, WebP</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleSelect}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {files.map((file, i) => (
            <div key={i} className="relative group">
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <p className="text-xs text-gray-500 mt-1 truncate">{file.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
