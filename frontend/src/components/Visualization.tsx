import React from 'react';
import { Box, Typography } from '@mui/material';
import { PieChart, Pie, BarChart, Bar, LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Visualization as VisualizationType } from '../services/api';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const Visualization: React.FC<{
  data: Record<string, any>[];
  config: VisualizationType;
}> = ({ data, config }) => {
  // Early return if we don't have the required data
  if (!config.labels || !config.datasets?.[0]?.data) {
    return null;
  }

  // Ensure we have the dataset for TypeScript
  const dataset = config.datasets[0];
  if (!dataset) return null;

  // Transform the data consistently for all chart types
  const chartData = config.labels.map((label, index) => ({
    name: label,
    value: dataset.data[index],
  }));

  const renderChart = () => {
    switch (config.type) {
      case 'pie_chart':
        return (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                label
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={dataset.backgroundColor?.[index] || COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'bar_chart':
        return (
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name={dataset.label}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={dataset.backgroundColor?.[index] || COLORS[index % COLORS.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line_chart':
        return (
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                name={dataset.label}
                stroke={dataset.backgroundColor?.[0] || '#8884d8'}
                dot={{ fill: dataset.backgroundColor?.[0] || '#8884d8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'scatter_plot':
        return (
          <ResponsiveContainer>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" name={config.x_axis || 'X'} />
              <YAxis dataKey="value" name={config.y_axis || 'Y'} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter 
                name={dataset.label} 
                data={chartData} 
                fill={dataset.backgroundColor?.[0] || '#8884d8'} 
              />
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ 
      width: '100%', 
      height: 300,
      mb: 6  // Increase margin bottom to 48px (6 * 8px) between visualizations
    }}>
      <Typography variant="h6" align="center" gutterBottom>
        {config.title}
      </Typography>
      {renderChart()}
    </Box>
  );
};
