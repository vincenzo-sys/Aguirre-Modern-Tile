'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Profile, JobWithAssignee, JobStatus } from '@/lib/supabase/types'

const statusColors: Record<JobStatus, string> = {
  lead: '#eab308',
  quoted: '#3b82f6',
  scheduled: '#a855f7',
  in_progress: '#f97316',
  completed: '#22c55e',
  paid: '#10b981',
  cancelled: '#9ca3af',
}

interface TeamMapInnerProps {
  team: Profile[]
  jobs: JobWithAssignee[]
  jobCoords: Record<string, [number, number]>
}

export default function TeamMapInner({ team, jobs, jobCoords }: TeamMapInnerProps) {
  return (
    <MapContainer
      center={[42.36, -71.06]}
      zoom={11}
      className="w-full h-full"
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Team member markers */}
      {team.map((member) => {
        if (member.last_location_lat == null || member.last_location_lng == null) return null
        const initial = member.full_name.charAt(0)
        return (
          <CircleMarker
            key={member.id}
            center={[member.last_location_lat, member.last_location_lng]}
            radius={14}
            pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <div className="text-center">
                <p className="font-bold text-sm">{member.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                {member.last_location_updated_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last seen: {new Date(member.last_location_updated_at).toLocaleString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )
      })}

      {/* Job site markers */}
      {jobs.map((job) => {
        const coords = jobCoords[job.id]
        if (!coords) return null
        return (
          <CircleMarker
            key={job.id}
            center={coords}
            radius={7}
            pathOptions={{
              color: statusColors[job.status] || '#9ca3af',
              fillColor: statusColors[job.status] || '#9ca3af',
              fillOpacity: 0.7,
              weight: 1,
            }}
          >
            <Popup>
              <div>
                <p className="font-bold text-sm">#{job.job_number} {job.title}</p>
                <p className="text-xs text-gray-600">{job.client_name}</p>
                <p className="text-xs text-gray-500">{job.client_address}</p>
                <p className="text-xs mt-1 capitalize">{job.status.replace('_', ' ')}</p>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
