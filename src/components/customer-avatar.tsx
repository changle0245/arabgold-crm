'use client'

// 客户头像显示：有头像 → 圆形图；没头像 → 首字母圆形占位
interface Props {
  url?: string | null
  name?: string
  size?: number  // 像素，默认 32
  className?: string
}

// 根据姓名生成稳定的颜色
function nameColor(name: string): string {
  const colors = [
    'bg-amber-100 text-amber-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return colors[Math.abs(hash) % colors.length]
}

function initial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // 中文取最后一个字（中文姓在前，名在后）；英文取首字母
  const firstChar = trimmed[0]
  if (/[一-鿿]/.test(firstChar)) return firstChar
  return firstChar.toUpperCase()
}

export function CustomerAvatar({ url, name = '', size = 32, className = '' }: Props) {
  const dimension = { width: size, height: size }

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={dimension}
        className={`rounded-full object-cover border border-gray-200 ${className}`}
      />
    )
  }

  return (
    <div
      style={{ ...dimension, fontSize: size * 0.4 }}
      className={`rounded-full flex items-center justify-center font-semibold ${nameColor(name || '?')} ${className}`}
    >
      {initial(name)}
    </div>
  )
}
