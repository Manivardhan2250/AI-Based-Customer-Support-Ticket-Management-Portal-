import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const COLORS = ['#6477f4', '#14a990', '#f3a448', '#ed6b76', '#8a72db']

function AnalyticsCharts({ variant, data, dataKey, valueKey }) {
  if (variant === 'donut') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="status" innerRadius={56} outerRadius={78} paddingAngle={4} stroke="none">
            {data.map((item, index) => <Cell key={item.status} fill={COLORS[index % COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const isTrend = variant === 'trend'
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#edf0f5" vertical={false} />
        <XAxis dataKey={isTrend ? 'month' : dataKey} axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9299a8', fontSize: 10 }} />
        <Tooltip cursor={{ fill: '#f5f6fb' }} />
        <Bar dataKey={isTrend ? 'count' : valueKey} name="Tickets" fill="#626fe8" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default AnalyticsCharts
