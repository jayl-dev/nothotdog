const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Generate build ID
const BUILD_ID = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

module.exports = {
  entry: './app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  mode: 'production',
  optimization: {
    minimize: true,
  },
  performance: {
    // ML models are intentionally larger than webpack's web-app defaults.
    maxAssetSize: 5 * 1024 * 1024,
    maxEntrypointSize: 2 * 1024 * 1024,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        // README media under screenshots/ is intentionally repository-only.
        { from: 'icons/not-hot-dog.svg', to: 'icons/not-hot-dog.svg' },
        { from: 'icons/not-hot-dog-192.png', to: 'icons/not-hot-dog-192.png' },
        { from: 'icons/not-hot-dog-512.png', to: 'icons/not-hot-dog-512.png' },
        {
          from: 'models/coco-ssd-lite-mobilenet-v2',
          to: 'models/coco-ssd-lite-mobilenet-v2',
        },
        { from: 'manifest.json', to: 'manifest.json' },
        {
          from: 'index.html',
          to: 'index.html',
          transform: (content) => content.toString().replace(
            'src="bundle.js"',
            `src="bundle.js?v=${BUILD_ID}"`
          ),
        },
        { 
          from: 'service-worker.js', 
          to: 'service-worker.js',
          transform: (content) => content
            .toString()
            .replace(
              /const CACHE_NAME = '[^']*';/,
              `const CACHE_NAME = 'not-hot-dog-${BUILD_ID}';`
            )
            .replace("'./bundle.js',", `'./bundle.js?v=${BUILD_ID}',`),
        },
        { from: 'styles.css', to: 'styles.css' },
      ],
    }),
  ],
  resolve: {
    fallback: {
      'fs': false,
      'path': false,
      'crypto': false
    },
    extensions: ['.js', '.json']
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
};
