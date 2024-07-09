const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

module.exports = {
  entry: './src/index.js',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },

  // Rules for processing different file types
  module: {
    rules: [
      {
        test: /\.(png|jpe?g|gif)$/i,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        exclude: /node_modules/,
        use: [
          'style-loader',
          'css-loader',
          'postcss-loader',
        ],
      }
    ],
  },
  plugins: [
    // Plugin to dynamically generate an index.html and inject the bundled script
    new HtmlWebpackPlugin({
      template: './public/index.html', // Path to your HTML file
    }),
    new webpack.DefinePlugin({
      'process.env.BASE_URL': JSON.stringify(process.env.BASE_URL),
      // 'process.env.JWT_TOKEN': JSON.stringify(process.env.JWT_TOKEN),
    }),
  ],
  devServer: {
    historyApiFallback: true,
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 8080, 
    proxy: {
      "/api": "http://localhost:3000",
      "/app": "http://localhost:3000"
      // "/socket.io": {
      //   target: "http://localhost:3000",
      //   ws: true
      // }
    },
  },

//does the .js/.jsx stuff for you on imports
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};