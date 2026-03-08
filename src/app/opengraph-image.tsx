import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Aguirre Modern Tile - Expert Tile Installation in Greater Boston'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0c4a6e, #0284c7, #0369a1)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo / Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              background: 'white',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#0284c7',
            }}
          >
            A
          </div>
          <div style={{ color: 'white', fontSize: '28px', fontWeight: '600' }}>
            Aguirre Modern Tile
          </div>
        </div>

        {/* Main text */}
        <div
          style={{
            color: 'white',
            fontSize: '56px',
            fontWeight: 'bold',
            lineHeight: '1.2',
            marginBottom: '24px',
          }}
        >
          Expert Tile Installation in Greater Boston
        </div>

        {/* Subtext */}
        <div
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '24px',
            lineHeight: '1.4',
            marginBottom: '40px',
          }}
        >
          15+ years experience &bull; 150+ five-star reviews &bull; Free estimates
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '12px 24px',
              color: 'white',
              fontSize: '20px',
              fontWeight: '600',
            }}
          >
            (617) 766-1259
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px' }}>
            aguirremoderntile.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
