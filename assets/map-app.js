'use-strict';

Element.prototype.toggleClass = function(name, flag) {
    if (flag && !this.classList.contains(name)) {
        this.classList.add(name);
    }
    if (!flag && this.classList.contains(name)) {
        this.classList.remove(name);
    }
    return this;
};

var trailsroc = (function() {

var dev = (window.location.hostname == 'localhost');
var mapboxConfig = { };
var canonicalUrlBase = `${window.location.protocol}//${window.location.host}/`;

if (dev) {
    mapboxConfig.token = 'pk.eyJ1IjoibW1lcnRzb2NrIiwiYSI6ImNqM2xsdmM2azAwenYzM3J6bmx4amdkenUifQ.I7qKxvIRIYu22LK9mKv2xg';
    mapboxConfig.styleUri = 'mapbox://styles/mmertsock/cj4693efo04te2rp5tdx3nyub';
    mapboxConfig.defaultSelectionParams = {
        lat: 43.025,
        lon: -77.572,
        zoom: 14.88,
        itemID: null,
        title: null
    };
} else {
    mapboxConfig.token = 'pk.eyJ1IjoidHJhaWxzcm9jIiwiYSI6ImNqOW94MjB2dTVraDYycW5yZmtxZ3ljNTUifQ.-servtc1C9TmiyDbmPCx_g';
    mapboxConfig.styleUri = 'mapbox://styles/trailsroc/cje2xhtz5d2fa2rq9bvnuhmgq';
    mapboxConfig.defaultSelectionParams = {
        lat: 43.16115,
        lon: -77.63425,
        zoom: 9,
        itemID: null,
        title: null
    };
}

function log(o) {
    console.log(o);
}

function copyTemplateElem(sourceClass) {
    var elem = document.querySelector(`#templates .${sourceClass}`).cloneNode(true);
    elem.toggleClass('template-cloned', true);
    return elem;
}

function polylineCenterLngLat(coords) {
    var minLon = 180;
    var maxLon = -180;
    var minLat = 90;
    var maxLat = -90;
    coords.forEach(function (coord) {
        minLon = Math.min(minLon, coord[0]);
        maxLon = Math.max(maxLon, coord[0]);
        minLat = Math.min(minLat, coord[1]);
        maxLat = Math.max(maxLat, coord[1]);
    });
    var center = [0.5 * (minLon + maxLon), 0.5 * (minLat + maxLat)];
    return center;
}

function featureCenterLngLat(feature) {
    if (!feature || !feature.geometry) {
        return null;
    }
    if (feature.geometry.type == "Point") {
        return feature.geometry.coordinates;
    }
    if (feature.geometry.type == "Polygon") {
        return polylineCenterLngLat(feature.geometry.coordinates[0]);
    }
    if (feature.geometry.type == "LineString") {
        return polylineCenterLngLat(feature.geometry.coordinates);
    }
    return null;
}

var MapSelection = class MapSelection {
    static defaultMapLocation() {
        return new MapSelection(mapboxConfig.defaultSelectionParams);
    }

    static fromURL(urlString) {
        var values = { };

        if (urlString) {
            // TODO "TypeError: Type error" if bad URL
            var url = new URL(urlString);
            // https://map.trailsroc.org/?lat=43.237&lon=-77.567&zoom=14.88&itemID=point-shelter:durand_eastman:7a5f32ae
            if (url.pathname == '/') {
                var urlLat = parseFloat(url.searchParams.get('lat'));
                var urlLon = parseFloat(url.searchParams.get('lon'));
                var urlZoom = parseFloat(url.searchParams.get('zoom'));
                if (!isNaN(urlLat) && !isNaN(urlLon)) {
                    values.lat = urlLat;
                    values.lon = urlLon;
                }
                if (!isNaN(urlZoom)) {
                    values.zoom = urlZoom;
                } else {
                    values.zoom = 13;
                }
                var rawid = url.searchParams.get('itemID');
                if (!!rawid && rawid.length > 0) {
                    values.itemID = rawid;
                }
                //values.title = values.itemID;
            }
            // https://map.trailsroc.org/m/abcdefgh/ijklmnop
            if (url.pathname.startsWith('/m/')) {
                log("TODO parse short-url");
            }
        }

        if (!!values.lat && !!values.lon) {
            return new MapSelection(values);
        } else {
            return null;
        }
    }

    static fromFeature(feature) {
        var center = featureCenterLngLat(feature);
        if (!center || !feature.properties) {
            return null;
        }
        var itemID = feature.properties["trailsroc-id"];
        if (feature.properties["trailsroc-type"] == "parkBorder") {
            itemID = feature.properties["trailsroc-parkID"];
        }

        var values = {
            lat: center[1],
            lon: center[0],
            // TODO zoom
            itemID: itemID,
            // TODO name may be empty
            title: feature.properties["trailsroc-name"],
            feature: feature
        };
        return new MapSelection(values);
    }

    static forVisibleMap(map) {
        var values = {
            lat: map.getCenter().lat,
            lon: map.getCenter().lng,
            zoom: map.getZoom()
        };
        return new MapSelection(values);
    }

    constructor(values) {
        this.lat = values.lat;
        this.lon = values.lon;
        this.zoom = values.zoom;
        this.itemID = values.itemID;
        this.title = values.title;
        if (values.feature) {
            this.feature = values.feature;
        } else {
            this.feature = null;
        }
    }

    get coords() {
        return { lat: this.lat, lon: this.lon };
    }

    get webAppZoom() {
        return this.zoom;
    }

    get camera() {
        if (!this.lon || !this.lat || !this.zoom) { return null; }
        return {
            center: [this.lon, this.lat],
            zoom: this.webAppZoom
        };
    }

    get canonicalUrl() {
        var url = new URL(canonicalUrlBase);
        if (!!this.lat && !!this.lon) {
            url.searchParams.set('lat', this.lat.toFixed(4));
            url.searchParams.set('lon', this.lon.toFixed(4));
        }
        if (!!this.zoom) {
            url.searchParams.set('zoom', this.zoom.toFixed(1));
        }
        if (!!this.itemID) {
            url.searchParams.set('itemID', this.itemID);
        }
        return url;
    }

    get systemMapURL() {
        if (!this.lat || !this.lon) {
            return null;
        }

        // https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
        var url = new URL('https://maps.apple.com');
        var coordString = `${this.lat},${this.lon}`;
        url.searchParams.set('ll', coordString);
        url.searchParams.set('daddr', coordString);
        if (!!this.zoom) {
            url.searchParams.set('z', this.zoom);
        }
        if (!!this.title) {
            url.searchParams.set('q', this.title);
        }
        return url;
    }

    get historyStateObj() {
        var values = { };
        if (!!this.lat) { values.lat = this.lat };
        if (!!this.lon) { values.lon = this.lon };
        if (!!this.zoom) { values.zoom = this.zoom };
        if (!!this.itemID) { values.itemID = this.itemID };
        if (!!this.title) { values.title = this.title };
        return values;
    }

    updateWithVisibleRegion(map) {
        this.zoom = map.getZoom();
        this.lat = map.getCenter().lat;
        this.lon = map.getCenter().lng;
    }
};

var EntityFinder = class EntityFinder {

    constructor(map) {
        this.map = map;
        this.cachedLookups = {};
        this.trailsrocLayerIDs = map.getStyle().layers.map(
            function (l) { return l.id; }
        ).filter(
            function (l) { return l.startsWith("trailsroc-"); }
        );
    }

    featureWithID(trailsrocID) {
        var cached = this.cachedLookups[trailsrocID];
        if (cached) {
            log(`Found cached feature ${trailsrocID}`);
            return cached;
        }

        var found = this.map.queryRenderedFeatures({
            filter: ["==", "trailsroc-id", trailsrocID]
        }).filter(function (f) {
            return f.layer && this.trailsrocLayerIDs.indexOf(f.layer.id) >= 0;
        }.bind(this));
        found = found.length == 1 ? found[0] : null;
        if (found != null) {
            this.cachedLookups[trailsrocID] = found;
        }
        return found;
    }

    bestFeatureAtCoordinate(point) {
        var r = 5;
        var bbox = [{ x: point.x - r, y: point.y - r }, { x: point.x + r, y: point.y + r }];
        var found = this.map.queryRenderedFeatures(bbox, {
            layers: this.trailsrocLayerIDs,
            filter: ["has", "trailsroc-id"]
        }).map(function (f) { return new FinderCandidate(f, this); }.bind(this))
        .filter(function (f) { return f.isSelectable; });

        found.sort(function (a, b) { return a.score - b.score; });
        log(found.map(function (f) { return f.debugString; }));

        return found.length > 0 ? found[0].feature : null;
    }
};

var FinderCandidate = class FinderCandidate {

    constructor(candidate, finder) {
        if (candidate.properties["trailsroc-type"] == "parkBorder" && candidate.properties["trailsroc-parkID"]) {
            var park = finder.featureWithID(candidate.properties["trailsroc-parkID"]);
            this.feature = park || candidate;
            this.isIndirect = true;
        } else {
            this.feature = candidate;
            this.isIndirect = false;
        }
    }

    get isSelectable() {
        if (!this.feature) { return false; }
        var t = this.feature.properties["trailsroc-type"];
        return t == "park"
            || (t == "parkBorder" && this.feature.properties["trailsroc-parkID"])
            || t == "trailSegment"
            || t.startsWith("point-");
    }

    get score() {
        var partialScore = 0;
        var t = this.feature.properties["trailsroc-type"];
        if (t == "parkBorder") {
            partialScore += 30;
        } else if (t == "park") {
            partialScore += 25;
        } else if (t == "trailSegment") {
            partialScore += 20;
            if (!this.feature.properties["trailsroc-shortName"]) {
                partialScore += 1;
            }
        } else if (["point-lodge", "point-parking", "point-poi", "point-restroom", "point-scenic", "point-shelter"].indexOf(t) >= 0) {
            partialScore += 10;
        } else if (t.startsWith("point-")) {
            partialScore += 11;
        } else {
            partialScore += 100;
        }
        if (this.isIndirect) {
            partialScore += 1;
        }
        return partialScore;
    }

    get debugString() {
        var id = this.feature.properties["trailsroc-id"];
        return `<FC #${id} @${this.score}>`;
    }
};

var MapboxApp = class MapboxApp {

    constructor() {
        var initialSelection = MapSelection.fromURL(window.location.href);
        var loc = initialSelection || MapSelection.defaultMapLocation();

        mapboxgl.accessToken = mapboxConfig.token;
        this.map = new mapboxgl.Map({
            container: 'trailsroc-map',
            style: mapboxConfig.styleUri,
            minZoom: 7,
            maxZoom: 18,
            maxBounds: [[-78.9,42.1],[-76.25,43.53]],
            center: [loc.coords.lon, loc.coords.lat],
            zoom: loc.webAppZoom
        });

        this.map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }));
        this.map.addControl(new mapboxgl.ScaleControl());
        this.map.addControl(new mapboxgl.GeolocateControl({ showUserLocation: true }));

        if (initialSelection && initialSelection.itemID) {
            this.initialSelection = initialSelection;
        }

        this.highlights = { markers: [], layerIDs: [] };
        this.mapRenderedDebouncer = null;
        this.initialLoadComplete = false;
        this.replaceHistoryState(loc);

// TODO why do we need a slight delay after style loaded 
// for entity search to work?
        // this.map.on('styledata', function() {
        //     log("styledata event");
        //     setTimeout(function () { this.styleLoaded(); }.bind(this), 1500);
        // }.bind(this));
// If can't figure it out, could try to load initial selection once quickly, and 
// try one more time if needed X seconds later.

        this.map.on('load', function() {
//            log("load event");
            setTimeout(function () { this.styleLoaded(); }.bind(this), 1500);
        }.bind(this));

        document.querySelectorAll('a.permalink').forEach(function(elem) {
            elem.addEventListener('click', function (e) {
                this.permalinkSelected();
                e.preventDefault();
            }.bind(this));
        }.bind(this));

        document.body.addEventListener('keyup', function (e) {
            if (e.keyCode == 27) { // ESC
                document.querySelectorAll('.dialog-container.template-cloned').forEach(function (elem) {
                    elem.remove();
                });
            }
        });
    }

    styleLoaded() {
        if (this.initialLoadComplete || !this.map.isStyleLoaded()) { return; }
        this.initialLoadComplete = true;

        // have entity finder init with list of interesting layers
//        log("initialLoadComplete");
        this.finder = new EntityFinder(this.map);

        if (this.initialSelection) {
            var found = this.finder.featureWithID(this.initialSelection.itemID);
            this.initialSelection = null;
            if (found) {
                this.showSelection(MapSelection.fromFeature(found), { updateBounds: false, animated: false });
            }
        }

// TODO error trace ("undefined") when trying to click a Marker to show a Popup
        this.map.on('click', function(e) {
            this.mapTouched(e);
        }.bind(this));

        this.map.on('render', function() {
            this.mapRendered();
        }.bind(this));
    }

    mapTouched(e) {
//        log(`mapTouched at ${e.lngLat}`);
        var found = this.finder.bestFeatureAtCoordinate(e.point);
        if (!found) {
            this.showSelection(null, { updateBounds: false, animated: false });
            return;
        }
        var sel = MapSelection.fromFeature(found);
        if (sel) {
            this.showSelection(sel, { updateBounds: true, animated: true });
        }
    }

    mapRendered() {
        if (this.mapRenderedDebouncer !== null) {
            window.clearTimeout(this.mapRenderedDebouncer);
        }
        this.mapRenderedDebouncer = window.setTimeout(function () {
            this.mapRenderedDebouncer = null;
            if (this.selection) {
                this.selection.updateWithVisibleRegion(this.map);
                this.replaceHistoryState(this.selection);
            }
        }.bind(this), 750);
    }

    showSelection(sel, opt) {
        var options = Object.assign({ updateBounds: false, animated: false }, opt);

        this.clearMarkers();
        if (!sel) {
            sel = MapSelection.forVisibleMap(this.map);
        }
        if (!sel) {
            this.selection = null;
            return;
        }

        if (!sel.zoom) {
            sel.zoom = this.map.getZoom();
        }
        this.selection = sel;
        this.replaceHistoryState(sel);

        if (sel.itemID) {
            if (!sel.feature) {
                sel.feature = this.finder.featureWithID(sel.itemID);
            }
            this.addMarker(sel.coords.lat, sel.coords.lon, sel.feature);
        }

        var cam = sel.camera;
        if (options.updateBounds && cam) {
            if (options.animated) {
                this.map.easeTo(cam);
            } else {
                this.map.jumpTo(cam);
            }
        }
    }

    clearMarkers() {
        this.highlights.markers.forEach(function (marker) {
            marker.remove();
        });
        this.highlights.markers = [];
        this.highlights.layerIDs.forEach(function (id) {
            this.map.removeLayer(id);
        }.bind(this));
        this.highlights.layerIDs = [];
    }

    addMarker(lat, lon, feature) {
        if (feature && feature.geometry.type == "LineString") {
            var layer = {
                id: `app-highlight-line-${parseInt(Math.random() * 10000)}`,
                type: "line",
                source: {
                    type: "geojson",
                    data: feature
                },
                layout: {
                    "line-join": "round",
                    "line-cap": "round",
                },
                paint: {
                    "line-color": "rgba(255, 108, 0, 0.35)",
                    "line-width": 11
                }
            };
            this.map.addLayer(layer);
            this.highlights.layerIDs.push(layer.id);
        } else {
            var opts = {
                element: copyTemplateElem('map-marker')
            };
            var marker = new mapboxgl.Marker(opts)
                .setLngLat([lon, lat])
                .addTo(this.map);
            this.highlights.markers.push(marker);
        }
    }

    replaceHistoryState(sel) {
        var historyTitle = "#TrailsRoc Maps";
        var itemElem = document.querySelector('#selected-item');
        if (sel.title) {
            historyTitle = `${sel.title} — #TrailsRoc Maps`;
            itemElem.innerText = sel.title;
            itemElem.toggleClass('expanded', true);
        } else {
            itemElem.toggleClass('expanded', false);
        }
        document.title = historyTitle;
        history.replaceState(sel.historyStateObj, historyTitle, sel.canonicalUrl);

        var metaContent = "app-id=906444281";
        if (sel.canonicalUrl) {
            var url = sel.canonicalUrl.toString();
            metaContent = `${metaContent}, app-argument=${url}`;
            log(`Set historyState to ${sel.canonicalUrl.toString()}`);
        }
        var metaElem = document.querySelector('meta[name=apple-itunes-app]');
        if (metaElem) {
            metaElem.content = metaContent;
        }

        document.querySelectorAll('a.permalink').forEach(function (elem) {
            elem.href = sel.canonicalUrl;
        });

        var systemMapURL = sel.systemMapURL;
        if (systemMapURL) {
            document.querySelectorAll('a.get-directions').forEach(function (elem) {
                elem.href = systemMapURL.toString();
            });
        }
    }

    permalinkSelected() {
        var sel = this.selection || MapSelection.forVisibleMap(this.map);
        if (!sel) { return; }
        if (!sel.canonicalUrl) { return; }
        var containerElem = copyTemplateElem('dialog-container');
        var contentElem = copyTemplateElem('permalink-dialog');
        var urlElem = contentElem.querySelector('.permalink-url');
        urlElem.innerText = sel.canonicalUrl.toString();
        containerElem.append(contentElem);
        document.body.append(containerElem);

        var doneButton = contentElem.querySelector('.dialog-done button');
        doneButton.addEventListener('click', function () {
            containerElem.remove();
        });

        var selectUrl = function(e) {
            urlElem.contentEditable = true;
            var range = document.createRange();
            range.selectNodeContents(urlElem);
            var textSelection = window.getSelection();
            textSelection.removeAllRanges();
            textSelection.addRange(range);
            if (e) { e.preventDefault(); }
        };

        window.setTimeout(selectUrl, 250);
        urlElem.addEventListener('click', selectUrl);
    }
};

return { MapboxApp: MapboxApp, MapSelection: MapSelection };

})(); // end trailsroc namespace

function initializePage() {
    trailsroc.app = new trailsroc.MapboxApp();
}
