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
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// 获取高德API前缀
const GAODE_API_PREFIX = isLocal ? '' : 'https://restapi.amap.com';

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

  // 高德地理编码API自动补全
  const fetchGaodeSuggest = async (input, setSuggest) => {
    if (!input || isLngLat(input)) {
      setSuggest([]);
      return;
    }
    // 用GAODE_API_PREFIX拼接
    const url = `${GAODE_API_PREFIX}/v3/assistant/inputtips?key=${GAODE_KEY}&keywords=${encodeURIComponent(input)}&datatype=all&city=全国`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.tips) {
      // 只保留有location的建议
      setSuggest(data.tips.filter(t => t.location).map(t => ({
        name: t.name + (t.district ? `（${t.district}）` : ""),
        location: t.location // "lng,lat"
      })));
    } else {
      setSuggest([]);
    }
  };

  // 高德地理编码API，支持经纬度输入
  const gaodeGeocode = async (place) => {
    const coord = isLngLat(place);
    if (coord) return coord;
    const url = `${GAODE_API_PREFIX}/v3/geocode/geo?key=${GAODE_KEY}&address=${encodeURIComponent(place)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.geocodes && data.geocodes.length > 0) {
      const loc = data.geocodes[0].location.split(',');
      return [parseFloat(loc[0]), parseFloat(loc[1])];
    }
    throw new Error("未找到地理位置: " + place);
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
    const token = process.env.REACT_APP_MAPBOX;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromCoord[0]},${fromCoord[1]};${toCoord[0]},${toCoord[1]}?geometries=geojson&access_token=${token}`;
    const res = await fetch(url);
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
  };

  // 修改handleGenerateRoute，动画时移动marker
  const handleGenerateRoute = async () => {
    if (!from || !to) {
      alert("请输入出发地和目的地");
      return;
    }
    setLoading(true);
    setIsFinished(false);
    try {
      const fromCoord = await gaodeGeocode(from);
      const toCoord = await gaodeGeocode(to);
      // 用Mapbox Directions API获取路线
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
      // 动态计算动画时长
      const distance = turf.lineDistance(path, { units: 'kilometers' });
      // 每公里0.5秒，最短3秒，最长30秒
      const duration = Math.max(3000, Math.min(30000, distance * 500));
      // 创建自定义交通方式图标marker
      let icon = icons[profile] || icons['driving'];
      const el = document.createElement('img');
      el.src = icon;
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.transform = 'translate(-16px, -16px)';
      const movingMarker = new mapboxgl.Marker({ element: el }).setLngLat(pinRoute[0]).addTo(map);
      // 动画时同步移动marker
      await playAnimations(mapboxgl, map, path, undefined, movingMarker, duration);
      movingMarker.remove();
      setIsFinished(true);
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    // 页面初始不自动播放动画
    // 只初始化地图，不加载路线、不播放动画
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
        top: 16,
        left: 16,
        zIndex: 10,
        background: "rgba(255,255,255,0.96)",
        padding: 10,
        borderRadius: 14,
        boxShadow: "0 2px 12px rgba(0,0,0,0.13)",
        display: "flex",
        gap: 6,
        alignItems: "flex-start",
        flexDirection: "column",
        minWidth: 240,
        maxWidth: 320,
        fontSize: 15,
        border: '1px solid #e0e0e0'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: 54}}>出发地：</span>
          <div style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 2}}>
            <input
              type="text"
              value={from}
              onChange={e => setFrom(e.target.value)}
              onFocus={() => setFromFocus(true)}
              onBlur={() => setTimeout(() => setFromFocus(false), 200)}
              placeholder="请输入出发地或经纬度"
              style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #ccc', width: '100%', fontSize: 14}}
            />
            <button
              type="button"
              style={{marginLeft: 2, padding: '2px 6px', borderRadius: 4, border: '1px solid #1976d2', background: selecting==='from' ? '#1976d2' : '#fff', color: selecting==='from' ? '#fff' : '#1976d2', cursor: 'pointer', fontSize: 13}}
              onClick={() => setSelecting(selecting==='from' ? null : 'from')}
              title="地图点选出发地"
            >📍</button>
            {fromFocus && fromSuggest.length > 0 && (
              <ul style={{position: 'absolute', top: 28, left: 0, right: 0, background: '#fff', border: '1px solid #ccc', borderRadius: 4, zIndex: 100, listStyle: 'none', margin: 0, padding: 0, maxHeight: 100, overflowY: 'auto', fontSize: 13}}>
                {fromSuggest.map((s, i) => (
                  <li key={i} style={{padding: 5, cursor: 'pointer'}} onClick={() => { setFrom(s.location); setFromSuggest([]); }}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: 54}}>目的地：</span>
          <div style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 2}}>
            <input
              type="text"
              value={to}
              onChange={e => setTo(e.target.value)}
              onFocus={() => setToFocus(true)}
              onBlur={() => setTimeout(() => setToFocus(false), 200)}
              placeholder="请输入目的地或经纬度"
              style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #ccc', width: '100%', fontSize: 14}}
            />
            <button
              type="button"
              style={{marginLeft: 2, padding: '2px 6px', borderRadius: 4, border: '1px solid #d32f2f', background: selecting==='to' ? '#d32f2f' : '#fff', color: selecting==='to' ? '#fff' : '#d32f2f', cursor: 'pointer', fontSize: 13}}
              onClick={() => setSelecting(selecting==='to' ? null : 'to')}
              title="地图点选目的地"
            >📍</button>
            {toFocus && toSuggest.length > 0 && (
              <ul style={{position: 'absolute', top: 28, left: 0, right: 0, background: '#fff', border: '1px solid #ccc', borderRadius: 4, zIndex: 100, listStyle: 'none', margin: 0, padding: 0, maxHeight: 100, overflowY: 'auto', fontSize: 13}}>
                {toSuggest.map((s, i) => (
                  <li key={i} style={{padding: 5, cursor: 'pointer'}} onClick={() => { setTo(s.location); setToSuggest([]); }}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 4, width: '100%'}}>
          <span style={{minWidth: 54}}>交通方式：</span>
          <select value={profile} onChange={e => setProfile(e.target.value)} style={{padding: '4px 6px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14}}>
            <option value="driving">驾车</option>
            <option value="walking">步行</option>
            <option value="cycling">骑行</option>
          </select>
        </div>
        <button
          style={{padding: '6px 16px', borderRadius: 6, background: '#1976d2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 15, alignSelf: 'center', marginTop: 2, boxShadow: '0 1px 4px rgba(25,118,210,0.08)'}}
          onClick={handleGenerateRoute}
          disabled={loading}
        >{loading ? "生成中..." : "生成路线"}</button>
      </div>
      {/* 地图容器 */}
      <div id="map" ref={mapContainerRef} />
      {isFinished && (
        <div
          style={{
            color: "#0F0",
            position: "absolute",
            top: 10,
            left: 10,
            fontSize: "20px",
            fontWeight: "bold",
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: "6px",
            padding: "6px",
          }}
        >
          Finished!
        </div>
      )}
    </>
  );
};

export default App;
