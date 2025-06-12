# Route Animate

一个基于 React + Mapbox 的路线动画展示工具，支持多种交通方式的路线规划和动画展示。

## 功能特点

- 🗺️ 基于 Mapbox GL JS 的地图展示
- 🔍 支持地名/经纬度输入，带自动补全功能
- 📍 支持地图点选选择出发地和目的地
- 🚗 支持多种交通方式：
  - 驾车
  - 步行
  - 骑行
  - 飞行
- 🎯 自定义交通图标动画
- ⚡ 智能动画时长调整（长距离自动加速）
- 🎨 美观的 UI 界面

## 本地开发

### 环境要求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本

### 安装依赖

```bash
npm install
```

### 配置环境变量

在项目根目录创建 `.env` 文件，添加以下环境变量：

```env
REACT_APP_MAPBOX=你的_Mapbox_访问令牌
GAODE_KEY=你的_高德地图_API_密钥
```

### 启动开发服务器

```bash
npm start
```

访问 http://localhost:3000 查看效果。

## 部署

### Vercel 部署

1. Fork 本仓库到你的 GitHub 账号
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置环境变量：
   - `REACT_APP_MAPBOX`
   - `GAODE_KEY`
4. 点击部署

### 构建生产版本

```bash
npm run build
```

## 使用说明

1. 输入出发地和目的地（支持地名或经纬度）
2. 选择交通方式（驾车/步行/骑行/飞行）
3. 点击搜索按钮获取路线
4. 查看路线动画效果

## 技术栈

- React 18
- Mapbox GL JS
- D3.js
- Turf.js

## 许可证

MIT

# Export to mp4

https://github.com/mapbox/mapbox-gl-js/blob/main/debug/video-export.html
https://ffmpeg.org/
`ffmpeg -i my_video.mp4 my_video_compressed.mp4`

# Export to gif
```bash
ffmpeg -i input.mp4 \
    -vf "fps=10,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
    -loop 0 output.gif
```
![Gif Output Example](/docs/output.gif)

## 3D Rotation

![Rotation Diagram](/docs/rotation.png)

Bearing is same as Yaw, no Roll on Map.

![Free Camera Diagram](/docs/freecamera-pos-calc.png)

3D Chart created with GeoGebra (https://www.geogebra.org/3d/z8czvzzw)

