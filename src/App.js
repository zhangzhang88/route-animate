import mapboxgl from "!mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import { useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import "./App.css";

// import {
//   add3D,
//   getMapOptions,
//   getPinRouteGeoJson,
//   playAnimations,
// } from "./animation2";
import {
  add3D,
  getMapOptions,
  getPinRouteGeoJson,
  playAnimations,
} from "./animation3";

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX;

const GAODE_KEY = "80c065cc8591209664760a236a3d4490";

// 判断是否本地开发环境
const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.') || window.location.hostname === '127.0.0.1';

// 获取高德API前缀
const GAODE_API_PREFIX = isLocal ? '/v3' : 'https://restapi.amap.com/v3';

const isLngLat = (str) => {
  if (typeof str !== 'string') return null; // 修复类型问题
  const parts = str.split(',').map(s => s.trim());
  if (parts.length === 2) {
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!isNaN(lng) && !isNaN(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
      return [lng, lat];
    }
  }
  return null;
};

// 用户自定义图标
const icons = {
  walking: '/icons/walk.png',
  cycling: '/icons/bike.png',
  driving: '/icons/car.png',
  flying: '/icons/plane.png',
};

const App = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const audioRef = useRef(null);
  const [isFinished, setIsFinished] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [fromSuggest, setFromSuggest] = useState([]);
  const [toSuggest, setToSuggest] = useState([]);
  const [fromFocus, setFromFocus] = useState(false);
  const [toFocus, setToFocus] = useState(false);
  const [profile, setProfile] = useState("driving");
  const [selecting, setSelecting] = useState(null); // 'from' | 'to' | null
  const [fromMarker, setFromMarker] = useState(null);
  const [toMarker, setToMarker] = useState(null);

  // 添加移动端检测
  const isMobile = window.innerWidth <= 768;

  // 高德地理编码API自动补全
  const fetchGaodeSuggest = async (input, setSuggest) => {
    if (!input || isLngLat(input)) {
      setSuggest([]);
      return;
    }
    try {
      const url = `${GAODE_API_PREFIX}/assistant/inputtips?key=${GAODE_KEY}&keywords=${encodeURIComponent(input)}&datatype=all&city=全国`;
      console.log('请求URL:', url);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (data.tips) {
        setSuggest(data.tips.filter(t => t.location).map(t => ({
          name: t.name + (t.district ? `（${t.district}）` : ""),
          location: t.location
        })));
      } else {
        setSuggest([]);
      }
    } catch (error) {
      console.error('自动补全请求失败:', error);
      setSuggest([]);
    }
  };

  // 高德地理编码API，支持经纬度输入
  const gaodeGeocode = async (place) => {
    const coord = isLngLat(place);
    if (coord) return coord;
    try {
      const url = `${GAODE_API_PREFIX}/geocode/geo?key=${GAODE_KEY}&address=${encodeURIComponent(place)}`;
      console.log('地理编码URL:', url);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (data.geocodes && data.geocodes.length > 0) {
        const loc = data.geocodes[0].location.split(',');
        return [parseFloat(loc[0]), parseFloat(loc[1])];
      }
      throw new Error("未找到地理位置: " + place);
    } catch (error) {
      console.error('地理编码请求失败:', error);
      throw error;
    }
  };

  // 动画时动态移动marker
  const moveMarkerAlongPath = async (map, pathCoords, profile) => {
    // 选择图标
    let icon = icons[profile] || icons['driving'];
    // 创建自定义marker
    const el = document.createElement('img');
    el.src = icon;
    el.style.width = '32px';
    el.style.height = '32px';
    el.style.transform = 'translate(-16px, -16px)';
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(pathCoords[0]).addTo(map);
    // 动画移动
    const steps = pathCoords.length;
    for (let i = 0; i < steps; i++) {
      marker.setLngLat(pathCoords[i]);
      await new Promise(res => setTimeout(res, 1000 / 60)); // 60fps
    }
    marker.remove();
  };

  // 恢复为Mapbox Directions API
  const getRouteGeoJSON = async (fromCoord, toCoord, profile) => {
    try {
      const token = process.env.REACT_APP_MAPBOX;
      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromCoord[0]},${fromCoord[1]};${toCoord[0]},${toCoord[1]}?geometries=geojson&access_token=${token}`;
      console.log('路线请求URL:', url);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        return {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: data.routes[0].geometry,
            },
          ],
        };
      }
      throw new Error("未找到路线");
    } catch (error) {
      console.error('路线请求失败:', error);
      throw error;
    }
  };

  // 修改handleGenerateRoute，添加移动端适配
  const handleGenerateRoute = async () => {
    if (!from || !to) {
      alert("请输入出发地和目的地");
      return;
    }
    setLoading(true);
    setIsFinished(false);
    try {
      // 播放音频
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      
      const fromCoord = await gaodeGeocode(from);
      const toCoord = await gaodeGeocode(to);
      const routeGeoJSON = await getRouteGeoJSON(fromCoord, toCoord, profile);
      const pinRoute = routeGeoJSON.features[0].geometry.coordinates;
      
      if (!mapRef.current) {
        mapRef.current = new mapboxgl.Map(getMapOptions(mapContainerRef.current));
        mapRef.current.addControl(new mapboxgl.NavigationControl());
        mapRef.current.once("style.load", () => {
          add3D(mapRef.current);
        });
      } else {
        if (mapRef.current.getLayer("line")) mapRef.current.removeLayer("line");
        if (mapRef.current.getSource("line")) mapRef.current.removeSource("line");
        document.querySelectorAll('.mapboxgl-marker').forEach(e => e.remove());
      }

      const map = mapRef.current;
      new mapboxgl.Marker({ color: "green", scale: 0.8 }).setLngLat(pinRoute[0]).addTo(map);
      new mapboxgl.Marker({ color: "red", scale: 0.8 }).setLngLat(pinRoute[pinRoute.length - 1]).addTo(map);
      
      map.addSource("line", {
        type: "geojson",
        lineMetrics: true,
        data: routeGeoJSON,
      });
      
      map.addLayer({
        type: "line",
        source: "line",
        id: "line",
        paint: {
          "line-color": "#ff0",
          "line-width": 5,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      const path = turf.lineString(pinRoute);
      const distance = turf.lineDistance(path, { units: 'kilometers' });
      const duration = Math.max(3000, Math.min(30000, distance * 500));
      
      let icon = icons[profile] || icons['driving'];
      const el = document.createElement('img');
      el.src = icon;
      el.style.width = isMobile ? '24px' : '32px';
      el.style.height = isMobile ? '24px' : '32px';
      el.style.transform = 'translate(-50%, -50%)';
      
      const movingMarker = new mapboxgl.Marker({ element: el }).setLngLat(pinRoute[0]).addTo(map);
      await playAnimations(mapboxgl, map, path, undefined, movingMarker, duration);
      movingMarker.remove();
      setIsFinished(true);
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 初始化音频
    audioRef.current = new Audio('/audio/route.MP3');
    audioRef.current.load();
    
    // 页面初始不自动播放动画
    if (mapRef.current) return;
    mapRef.current = new mapboxgl.Map(getMapOptions(mapContainerRef.current));
    mapRef.current.addControl(new mapboxgl.NavigationControl());
    mapRef.current.once("style.load", () => {
      add3D(mapRef.current);
    });
  }, []);

  // 输入变化时自动补全
  useEffect(() => { fetchGaodeSuggest(from, setFromSuggest); }, [from]);
  useEffect(() => { fetchGaodeSuggest(to, setToSuggest); }, [to]);

  // 地图点选事件
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const handleClick = (e) => {
      if (!selecting) return;
      const lngLat = e.lngLat;
      if (selecting === 'from') {
        setFrom(`${lngLat.lng.toFixed(6)},${lngLat.lat.toFixed(6)}`);
        if (fromMarker) fromMarker.remove();
        const marker = new mapboxgl.Marker({ color: 'green', scale: 0.8 })
          .setLngLat([lngLat.lng, lngLat.lat])
          .addTo(map);
        setFromMarker(marker);
      } else if (selecting === 'to') {
        setTo(`${lngLat.lng.toFixed(6)},${lngLat.lat.toFixed(6)}`);
        if (toMarker) toMarker.remove();
        const marker = new mapboxgl.Marker({ color: 'red', scale: 0.8 })
          .setLngLat([lngLat.lng, lngLat.lat])
          .addTo(map);
        setToMarker(marker);
      }
      setSelecting(null);
    };
    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [selecting, fromMarker, toMarker]);

  return (
    <>
      {/* 输入表单 */}
      <div style={{
        position: "absolute",
        top: isMobile ? 8 : 16,
        left: isMobile ? 8 : 16,
        right: isMobile ? 8 : 'auto',
        zIndex: 10,
        background: "rgba(255,255,255,0.96)",
        padding: isMobile ? 8 : 10,
        borderRadius: 14,
        boxShadow: "0 2px 12px rgba(0,0,0,0.13)",
        display: "flex",
        gap: isMobile ? 4 : 6,
        alignItems: "flex-start",
        flexDirection: "column",
        minWidth: isMobile ? 'auto' : 240,
        maxWidth: isMobile ? '100%' : 320,
        fontSize: isMobile ? 14 : 15,
        border: '1px solid #e0e0e0'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: isMobile ? 42 : 54}}>出发地：</span>
          <div style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 2}}>
            <input
              type="text"
              value={from}
              onChange={e => setFrom(e.target.value)}
              onFocus={() => setFromFocus(true)}
              onBlur={() => setTimeout(() => setFromFocus(false), 200)}
              placeholder="请输入出发地或经纬度"
              style={{
                padding: isMobile ? '3px 4px' : '4px 6px',
                borderRadius: 6,
                border: '1px solid #ccc',
                width: '100%',
                fontSize: isMobile ? 13 : 14
              }}
            />
            <button
              type="button"
              style={{
                marginLeft: 2,
                padding: isMobile ? '1px 4px' : '2px 6px',
                borderRadius: 4,
                border: '1px solid #1976d2',
                background: selecting==='from' ? '#1976d2' : '#fff',
                color: selecting==='from' ? '#fff' : '#1976d2',
                cursor: 'pointer',
                fontSize: isMobile ? 12 : 13
              }}
              onClick={() => setSelecting(selecting==='from' ? null : 'from')}
              title="地图点选出发地"
            >📍</button>
            {fromFocus && fromSuggest.length > 0 && (
              <ul style={{
                position: 'absolute',
                top: 28,
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 4,
                zIndex: 100,
                listStyle: 'none',
                margin: 0,
                padding: 0,
                maxHeight: isMobile ? 80 : 100,
                overflowY: 'auto',
                fontSize: isMobile ? 12 : 13
              }}>
                {fromSuggest.map((s, i) => (
                  <li key={i} style={{padding: isMobile ? 4 : 5, cursor: 'pointer'}} onClick={() => { setFrom(s.location); setFromSuggest([]); }}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: isMobile ? 42 : 54}}>目的地：</span>
          <div style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 2}}>
            <input
              type="text"
              value={to}
              onChange={e => setTo(e.target.value)}
              onFocus={() => setToFocus(true)}
              onBlur={() => setTimeout(() => setToFocus(false), 200)}
              placeholder="请输入目的地或经纬度"
              style={{
                padding: isMobile ? '3px 4px' : '4px 6px',
                borderRadius: 6,
                border: '1px solid #ccc',
                width: '100%',
                fontSize: isMobile ? 13 : 14
              }}
            />
            <button
              type="button"
              style={{
                marginLeft: 2,
                padding: isMobile ? '1px 4px' : '2px 6px',
                borderRadius: 4,
                border: '1px solid #d32f2f',
                background: selecting==='to' ? '#d32f2f' : '#fff',
                color: selecting==='to' ? '#fff' : '#d32f2f',
                cursor: 'pointer',
                fontSize: isMobile ? 12 : 13
              }}
              onClick={() => setSelecting(selecting==='to' ? null : 'to')}
              title="地图点选目的地"
            >📍</button>
            {toFocus && toSuggest.length > 0 && (
              <ul style={{
                position: 'absolute',
                top: 28,
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 4,
                zIndex: 100,
                listStyle: 'none',
                margin: 0,
                padding: 0,
                maxHeight: isMobile ? 80 : 100,
                overflowY: 'auto',
                fontSize: isMobile ? 12 : 13
              }}>
                {toSuggest.map((s, i) => (
                  <li key={i} style={{padding: isMobile ? 4 : 5, cursor: 'pointer'}} onClick={() => { setTo(s.location); setToSuggest([]); }}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: isMobile ? 42 : 54}}>交通方式：</span>
          <select 
            value={profile} 
            onChange={e => setProfile(e.target.value)} 
            style={{
              padding: isMobile ? '3px 4px' : '4px 6px',
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: isMobile ? 13 : 14
            }}
          >
            <option value="driving">驾车</option>
            <option value="walking">步行</option>
            <option value="cycling">骑行</option>
          </select>
        </div>
        <button
          style={{
            padding: isMobile ? '4px 12px' : '6px 16px',
            borderRadius: 6,
            background: '#1976d2',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: isMobile ? 14 : 15,
            alignSelf: 'center',
            marginTop: 2,
            boxShadow: '0 1px 4px rgba(25,118,210,0.08)'
          }}
          onClick={handleGenerateRoute}
          disabled={loading}
        >{loading ? "生成中..." : "生成路线"}</button>
      </div>
      {/* 地图容器 */}
      <div id="map" ref={mapContainerRef} style={{ width: '100%', height: '100vh' }} />
      {isFinished && (
        <div
          style={{
            color: "#0F0",
            position: "absolute",
            top: isMobile ? 8 : 10,
            left: isMobile ? 8 : 10,
            fontSize: isMobile ? "16px" : "20px",
            fontWeight: "bold",
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: "6px",
            padding: isMobile ? "4px" : "6px",
          }}
        >
          Finished!
        </div>
      )}
    </>
  );
};

export default App;
