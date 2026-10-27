import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV !== 'development';

const debugFlags = ['DBG_CAST', 'DBG_INV', 'CAS_DBG', 'FV_DBG'];
const defines = {
  'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
};
for (const flag of debugFlags) {
  defines[`process.env.${flag}`] = JSON.stringify(false);
}

export default {
  mode: isProd ? 'production' : 'development',
  entry: {
    'android-framework': { import: './src/framework/engine.js', runtime: false },
    apk: { import: './apk.js', dependOn: 'android-framework' },
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].min.js',
    chunkFormat: 'module',
    library: { type: 'module' },
    clean: true,
  },
  experiments: {
    outputModule: true,
  },
  externals: {
    jszip: 'JSZip',
  },
  optimization: {
    minimize: isProd,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: { passes: 2 },
          mangle: { keep_classnames: true, keep_fnames: true },
          format: { comments: false },
        },
        extractComments: false,
      }),
    ],
    splitChunks: false,
    runtimeChunk: false,

  },
  plugins: [new webpack.DefinePlugin(defines)],
  resolve: {
    extensions: ['.js'],
  },
  performance: { hints: false },
  devtool: isProd ? false : 'source-map',
};
