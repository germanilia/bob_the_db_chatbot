import React from 'react';
import { 
  BarChart, LineChart, PieChart, ScatterChart,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  Bar, Line, Pie, Scatter, ResponsiveContainer 
} from 'recharts';
import { Box, Typography } from '@mui/material';

interface VisualizationProps {
  data: any[];
  config: {
    type: 'table' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'scatter_plot';
    title: string;
    x_axis?: string;
    y_axis?: string;
    color_scheme?: string;
  };
}

const Visualization: React.FC<VisualizationProps> = ({ data, config }) => {
  if (!data || data.length === 0) return null;

  const chartColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#00C49F'];

  switch (config.type) {
    case 'bar_chart':
      return (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>{config.title}</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.x_axis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar 
                dataKey={config.y_axis} 
                fill={chartColors[0]}
                name={config.y_axis?.replace(/_/g, ' ')}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      );

    case 'pie_chart':
      return (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>{config.title}</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={data}
                dataKey={config.y_axis || "value"}
                nameKey={config.x_axis || "name"}
                cx="50%"
                cy="50%"
                outerRadius={150}
                fill={chartColors[0]}
                label
              />
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      );

    case 'line_chart':
      return (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>{config.title}</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.x_axis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={config.y_axis} 
                stroke={chartColors[0]}
                name={config.y_axis?.replace(/_/g, ' ')}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      );

    case 'scatter_plot':
      return (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>{config.title}</Typography>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={config.x_axis} type="number" />
              <YAxis dataKey={config.y_axis} type="number" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter 
                name="Data" 
                data={data} 
                fill={chartColors[0]}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </Box>
      );

    default:
      return null;
  }
};

export default Visualization;
