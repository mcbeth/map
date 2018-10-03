'use-strict';

/*
General feature todo list:
https://trello.com/c/re1eBZps

> map info panel html/css
> tap on map and show selection info
> parse selected entity from url and show info in selection panel
> modify browser url when interacting with map
- make sure min/max zoom, allowed map bounds, and default coords are correct
- share button to share a permalink
- meta tags, favicon, etc.
- apple smart app banner, with deep-linking
- android app banner
- browser compatibility check
- responsive design
> customize map controls. always show ruler. play with default mouse/touch controls
- satellite view support? maybe.
- link back to trailsroc.org
- "get driving directions" button
- /m/ shortlink support. note it will need to map /m/ url 
  to the same root index.html on the server
- change to trailsroc mapbox token when publishing
*/

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

var dev = true;
var mapboxConfig = { };
var canonicalUrlBase = "";

if (dev) {
    canonicalUrlBase = "http://localhost:4000/";
    mapboxConfig.token = 'pk.eyJ1IjoibW1lcnRzb2NrIiwiYSI6ImNqM2xsdmM2azAwenYzM3J6bmx4amdkenUifQ.I7qKxvIRIYu22LK9mKv2xg';
    mapboxConfig.styleUriTemplate = 'https://api.mapbox.com/styles/v1/mmertsock/cj4693efo04te2rp5tdx3nyub/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
    mapboxConfig.styleUri = 'mapbox://styles/mmertsock/cj4693efo04te2rp5tdx3nyub';
    mapboxConfig.tilesetID = 'mmertsock.cj9n3fgtp4y9w33s4gu6s8ir5-5yrj4';
} else {
    canonicalUrlBase = "https://map.trailsroc.org/";
    mapboxConfig.token = 'pk.eyJ1IjoidHJhaWxzcm9jIiwiYSI6ImNqOW94MjB2dTVraDYycW5yZmtxZ3ljNTUifQ.-servtc1C9TmiyDbmPCx_g';
    mapboxConfig.styleUriTemplate = 'https://api.mapbox.com/styles/v1/trailsroc/cjby9cvr4dt3w2sqegwrb5nkl/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
}

function log(o) {
    console.log(o);
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
        // TODO correct defaults
        return new MapSelection({
            lat: 43.025,
            lon: -77.572,
            zoom: 14.88,
            itemID: null,
            title: null,
        });
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
            title: feature.properties["trailsroc-name"]
        };
        return new MapSelection(values);
    }

    constructor(values) {
        this.lat = values.lat;
        this.lon = values.lon;
        this.zoom = values.zoom;
        this.itemID = values.itemID;
        this.title = values.title;
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
            url.searchParams.set('lat', this.lat);
            url.searchParams.set('lon', this.lon);
        }
        if (!!this.zoom) {
            url.searchParams.set('zoom', this.zoom);
        }
        if (!!this.itemID) {
            url.searchParams.set('itemID', this.itemID);
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
        });
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

        this.map.addControl(new mapboxgl.ScaleControl());
        this.map.addControl(new mapboxgl.GeolocateControl({ showUserLocation: true }));

        if (initialSelection && initialSelection.itemID) {
            this.initialSelection = initialSelection;
        }

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
        if (!found) { return; }
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

        if (this.marker) {
            this.marker.remove();
            this.marker = null;
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

        this.marker = new mapboxgl.Marker()
            .setLngLat([sel.coords.lon, sel.coords.lat])
            .addTo(this.map);

        if (sel.title && sel.title.length > 0) {
            var popup = new mapboxgl.Popup()
                .setText(sel.title);
            this.marker.setPopup(popup);
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

    replaceHistoryState(sel) {
        var historyTitle = "#TrailsRoc Maps";
        if (sel.title) {
            historyTitle = `${sel.title} — #TrailsRoc Maps`;
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
    }
};

return { MapboxApp: MapboxApp, MapSelection: MapSelection };

})(); // end trailsroc namespace

function initializePage() {
    trailsroc.app = new trailsroc.MapboxApp();
}
