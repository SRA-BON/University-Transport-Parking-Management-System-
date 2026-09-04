/// <reference types="vite/client" />

declare namespace google {
  namespace maps {
    interface MapTypeStyle {
      elementType?: string;
      featureType?: string;
      stylers: Array<Record<string, any>>;
    }
    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      zoomControl?: boolean;
      styles?: MapTypeStyle[];
      mapTypeId?: string;
    }
    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map | null;
      title?: string;
      icon?: string | Symbol | Icon;
      animation?: number | null;
      label?: string | MarkerLabel;
    }
    interface Symbol {
      path: string | number;
      scale?: number;
      anchor?: Point | null;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      rotation?: number;
      labelOrigin?: Point | null;
    }
    interface Icon {
      url: string;
      scaledSize?: Size | null;
      size?: Size | null;
      anchor?: Point | null;
      origin?: Point | null;
    }
    interface MarkerLabel {
      text: string;
      color?: string;
      fontFamily?: string;
      fontSize?: string;
      fontWeight?: string;
    }
    interface CircleOptions {
      center?: LatLng | LatLngLiteral;
      radius?: number;
      map?: Map | null;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      clickable?: boolean;
      draggable?: boolean;
      editable?: boolean;
      visible?: boolean;
      zIndex?: number;
    }
    interface PolylineOptions {
      path?: Array<LatLng | LatLngLiteral>;
      geodesic?: boolean;
      map?: Map | null;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      clickable?: boolean;
      draggable?: boolean;
      editable?: boolean;
      visible?: boolean;
      zIndex?: number;
    }
    class Map {
      constructor(div: HTMLElement, opts?: MapOptions);
      setCenter(latLng: LatLng | LatLngLiteral): void;
      getCenter(): LatLng | undefined;
      setZoom(zoom: number): void;
      getZoom(): number | undefined;
      setOptions(opts: MapOptions): void;
      panTo(latLng: LatLng | LatLngLiteral): void;
      addListener(event: string, fn: () => void): MapsEventListener;
    }
    class Marker {
      constructor(opts?: MarkerOptions);
      setPosition(latLng: LatLng | LatLngLiteral | null | undefined): void;
      setMap(map: Map | null): void;
      setIcon(icon: string | Symbol | Icon | null | undefined): void;
      setTitle(title: string): void;
      addListener(event: string, fn: () => void): MapsEventListener;
      getPosition(): LatLng | undefined;
    }
    class Circle {
      constructor(opts?: CircleOptions);
      setCenter(center: LatLng | LatLngLiteral | null | undefined): void;
      setRadius(radius: number): void;
      setMap(map: Map | null): void;
      getCenter(): LatLng | undefined;
      getRadius(): number;
    }
    class Polyline {
      constructor(opts?: PolylineOptions);
      setPath(path: Array<LatLng | LatLngLiteral>): void;
      setMap(map: Map | null): void;
      getPath(): MVCArray<LatLng>;
    }
    class LatLng {
      constructor(lat: number, lng: number, noWrap?: boolean);
      lat(): number;
      lng(): number;
      toJSON(): LatLngLiteral;
      toString(): string;
    }
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }
    class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
    }
    class Size {
      constructor(width: number, height: number, widthUnit?: string, heightUnit?: string);
      width: number;
      height: number;
    }
    class MVCArray<T> {
      constructor(array?: T[]);
      getAt(i: number): T;
      setAt(i: number, elem: T): void;
      insertAt(i: number, elem: T): void;
      removeAt(i: number): T;
      push(elem: T): number;
      pop(): T;
      getLength(): number;
      forEach(fn: (elem: T, i: number) => void): void;
      getArray(): T[];
    }
    interface MapsEventListener {
      remove(): void;
    }
    const Animation: {
      readonly BOUNCE: number;
      readonly DROP: number;
    };
    const SymbolPath: {
      readonly BACKWARD_CLOSED_ARROW: number;
      readonly BACKWARD_OPEN_ARROW: number;
      readonly CIRCLE: number;
      readonly FORWARD_CLOSED_ARROW: number;
      readonly FORWARD_OPEN_ARROW: number;
    };
  }
}

declare global {
  interface Window {
    google: any;
    initGoogleMap?: () => void;
  }
}

export {};
