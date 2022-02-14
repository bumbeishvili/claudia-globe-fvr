let apiUrlResolution2HexGeoJsonTop = "./data/splittedAreaH3R2.json";   // Expects GEO JSON Structure of resolution 2 hexes, with occupancy rate property (0-1)
let apiUrlResolution5HexJsonObject = ""
let apiUrlResolution6HexJsonObject = ""


let world = null;
let displacementScale = 15;
let hexPolygonResolution = 3;  // https://h3geo.org/docs/core-library/restable/
let prevZoomState = {};
let latestZoomState = { data: { lat: 0, lng: 0, altitude: 2.5 }, time: new Date() };
let zoomTimeout = null;
let landHexes = null;

let occupancyRatesHexGeojson = null;
let currentPolygonType = "default"
let prevUrl = null;
let prevData = null;
let selectedLandPieces = {};





initWorld()
initControls()
initDisplacement();
initLandAvailabilityLayer()
listenEvents();



function listenEvents() {
    document.addEventListener('imaginaryGlobeZoomEnd', zoomArgs => {
        console.log({ zoomArgs })
        adjustVisibleHexPolygons(zoomArgs.detail)
    })

    document.querySelector('.action-button.buy').addEventListener('click', () => {
        const keys = Object.entries(selectedLandPieces).filter(d => d[1]).map(d => d[0])
        onLandBuyInitiation({ hexArr: keys })
    })

    document.querySelector('.action-button.clear').addEventListener('click', () => {
        selectedLandPieces = {};
        checkButtonVisibility();
        showMessage("Selection Cleared!", 1000)
    })
}

function configureImaginaryGlobeZoomEndEvent(event) {
    prevZoomState = latestZoomState.data;
    latestZoomState.data = event
    roundLatLon(latestZoomState.data)
}

function roundLatLon(latLonObj) {
    let precision = 1000;
    latLonObj.lng = Math.round(latLonObj.lng * precision) / precision;
    latLonObj.lat = Math.round(latLonObj.lat * precision) / precision;
}


function initWorld() {
    // const N = 1;
    // const pickerMaterial = new THREE.MeshLambertMaterial({ color: "blue" });
    //  pickerMaterial.side = THREE.DoubleSide;
    // const gData = [...Array(N).keys()].map(() => ({
    //     lat: 41,
    //     lng: 41,
    //     alt: 0.1,
    //     width: 30,
    //     height: 30,
    //     material: pickerMaterial,
    //     color: ["red", "white", "blue", "green"][Math.round(Math.random() * 3)],
    // }));

    world = Globe()
        .globeImageUrl("./data/andromeda-low-mod.png")
        //("./data/andromeda-high-mod.png")
        .width(window.innerWidth)
        .height(window.innerHeight)
        .showGraticules(true)
        .atmosphereAltitude(0.25)
        .bumpImageUrl("./data/topo.png")
        .enablePointerInteraction(true)
        .onZoom((event) => {
            adjustDisplacementScale(event.altitude);
            configureImaginaryGlobeZoomEndEvent(event);
        })
        // .customThreeObject((d) => {
        //     const mesh = new THREE.Mesh(
        //         new THREE.PlaneGeometry(d.width, d.height),
        //         d.material
        //     );
        //     return mesh;
        // })
        // .customThreeObjectUpdate((obj, d) => {
        //     Object.assign(obj.position, world.getCoords(d.lat, d.lng, d.alt));
        //     obj.rotation.x = -Math.PI / 2;
        // })
        // .customLayerData(gData)

        // ----------  TILES ----------

        .backgroundImageUrl(
            "//unpkg.com/three-globe/example/img/night-sky.png"
        )(document.getElementById("globeViz"));

    console.log('globe created')
    setTimeout((d) => {
        // world.globeImageUrl("./data/andromeda-high-mod.png");
    }, 5000);


    // (function moveSpheres() {
    //   gData.forEach((d) => (d.lat += 0.2));
    //   world.customLayerData(world.customLayerData());
    //   requestAnimationFrame(moveSpheres);
    // })();

}


function initControls() {
    const controls = world.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;

    // stop autorotate after the first interaction
    controls.addEventListener("start", function () {
        controls.autoRotate = false;
    });


    controls.addEventListener("end", function () {
        latestZoomState.time = new Date();
        configureImaginaryGlobeZoomEndEvent(latestZoomState.data)

        if (zoomTimeout) {
            clearTimeout(zoomTimeout)
            zoomTimeout = null;
        }

        let timeoutTime = 500;
        zoomTimeOut = setTimeout(() => {
            const currentDate = new Date();
            const diff = currentDate - latestZoomState.time
            if (diff >= timeoutTime) {
                document.dispatchEvent(new CustomEvent('imaginaryGlobeZoomEnd', { detail: latestZoomState.data }));
            }

        }, timeoutTime)
    });

    world.onGlobeReady(() =>
        setTimeout(() => (world.controls().minDistance = 101.1))
    );



}

function initDisplacement() {
    const material = world.globeMaterial();
    const displacementTexture = new THREE.TextureLoader().load(
        "./data/topo.png"
    );
    material.displacementMap = displacementTexture;
    // material.wireframe = true;
    material.displacementScale = displacementScale;

}


function initLandAvailabilityLayer() {
    Promise.all(
        [
            fetch(apiUrlResolution2HexGeoJsonTop)
                .then((res) => res.json()),
            fetch("./data/innerHexesRes4.json")
                .then((res) => res.json()),
        ]
    )
        .then((data) => {
            landHexes = new Set(data[1])
            console.log({ landHexes })


            const occupancyRates = data[0];
            occupancyRatesHexGeojson = occupancyRates;
            world
                .hexPolygonsData(occupancyRates.features)
                .hexPolygonResolution(hexPolygonResolution)
                .hexPolygonMargin(0)
                .hexPolygonLabel(d => {
                    if (world.controls().autoRotate) {
                        return '';
                    }
                    return `<div style="width:100px;background-color:#191932;padding:15px;border-radius:5px;color:white">
                       ${Math.round(d.properties.occupancy * 100)}% of land is sold
                    </div>`
                })
                .onHexPolygonClick((hp, e) => {
                    console.log(hp, e)
                    const resolution = h3.h3GetResolution(hp.id);
                    if ((resolution == 6 || resolution == 7) && hp.properties.occupancy == 0) {
                        if (e.shiftKey) {
                            selectedLandPieces[hp.id] = !selectedLandPieces[hp.id];
                            showMessage(hp.id + ' added', 1000);
                            checkButtonVisibility();
                        } else {
                            selectedLandPieces = {}
                            selectedLandPieces[hp.id] = !selectedLandPieces[hp.id];
                            if (selectedLandPieces[hp.id]) {
                                showMessage(hp.id + ' added', 1000);
                            }
                            checkButtonVisibility();
                        }

                    }
                })
                .hexPolygonAltitude((d) => {
                    return 0.151;
                })
                .hexPolygonColor((d) => {
                    if (d.properties.occupancy < 0.2) return "rgba(0,40,256,0.1)";
                    if (d.properties.occupancy < 0.4) return "rgba(0,0,256,0.5)";
                    if (d.properties.occupancy < 0.6) return "orange";
                    if (d.properties.occupancy < 1) return "red";
                    return 'black'
                });
            //     .hexPolygonLabel(
            //       ({ properties: d }) => `
            //   <b>${d.ADMIN} (${d.ISO_A2})</b> <br />
            //   Population: <i>${d.POP_EST}</i>
            // `
            //     )
        });
}


function adjustDisplacementScale(altitude) {
    if (!world) return;

    if ((altitude - 0.05) < (displacementScale / 100)) {
        world.globeMaterial().displacementScale = 0;
    } else {
        world.globeMaterial().displacementScale = displacementScale;
    }
}

function adjustVisibleHexPolygons({ lat, lng, altitude }) {
    if (!world) return;

    function geojsonGenerator({ lat, lng }) {
        let url = `./data/resolution6HexJsonObject.json?lat=${lat}&lng=${lng}`
        if (prevUrl == url) {
            return new Promise((res) => res(prevData));
        }

        showMessage('Loading land availability data...')
        return new Promise((res, rej) => {


            fetch(url)
                .then(d => d.json())
                .then(data => {
                    let kRing = data.filter((h) =>
                        landHexes.has(h3.h3ToParent(Object.keys(h)[0], 4))
                    )
                    const hKeys = kRing.map(h => Object.keys(h)[0]);

                    const geojson = geojsonRewind(h3SetToFeatureCollection(hKeys));
                    geojson.features.forEach((d, i) => {
                        d.geometry.coordinates[0].reverse()
                        d.properties.occupancy = kRing[i][d.id]
                    })

                    prevData = geojson;
                    prevUrl = url;

                    res(geojson)
                })
        })
    }



    function mediumGenerator({ lat, lng }) {
        let url = `./data/resolution5HexJsonObject.json?lat=${lat}&lng=${lng}`
        if (prevUrl == url) {
            return new Promise((res) => res(prevData));
        }

        showMessage('Loading land availability data...')
        return new Promise((res, rej) => {
            fetch(url)
                .then(d => d.json())
                .then(data => {
                    let kRing = data.filter((h) =>
                        landHexes.has(h3.h3ToParent(Object.keys(h)[0], 4))
                    )
                    const hKeys = kRing.map(h => Object.keys(h)[0]);

                    const geojson = geojsonRewind(h3SetToFeatureCollection(hKeys));
                    geojson.features.forEach((d, i) => {
                        d.geometry.coordinates[0].reverse()
                        d.properties.occupancy = kRing[i][d.id]
                    })
                    prevData = geojson;
                    prevUrl = url;
                    res(geojson)
                })
        })
    }

    function worldGeoJsonGenerator() {
        showMessage('Loading land availability data...')
        return new Promise((res, rej) => {
            res(occupancyRatesHexGeojson)
        })
    }


    const configs = [
        {
            type: 'min',
            minZoom: 0.0,
            maxZoom: 0.05,
            polygonResolution: 6,
            kRingCount: 25,
            altitude: 0.00001,
            geojsonGenerator: geojsonGenerator,
            hexPolygonLabel: d => `<div style="width:200px;background-color:#191932;padding:15px;border-radius:5px;color:white">
            ${d.properties.occupancy ? "Land is SOLD!" : "Available for sale! </br> </br> Click to select one piece.  </br> </br> Shift + Click to select multiple! "}
             </div>`
            ,
            hexPolygonColor: ((d) =>{
                if(selectedLandPieces[d.id]){
                    return '#56E39F'
                }
                return d.properties.occupancy ? '#FF2D2E' : "rgba(0,255,255,0.2)"
            })
        },
        {
            type: 'medium',
            minZoom: 0.05,
            maxZoom: displacementScale / 100,
            polygonResolution: 5,
            kRingCount: 25,
            altitude: 0.0001,
            geojsonGenerator: mediumGenerator,
            hexPolygonLabel: d => `<div style="width:100px;background-color:#191932;padding:15px;border-radius:5px;color:white">
            ${Math.round(d.properties.occupancy * 100)}% of land is sold
             </div>`
            ,
            hexPolygonColor: ((d) => {
                if (d.properties.occupancy < 0.2) return "rgba(0,0,256,0.1)";
                if (d.properties.occupancy < 0.4) return "rgba(0,0,256,0.6)";
                if (d.properties.occupancy < 0.6) return "orange";
                if (d.properties.occupancy < 1) return "red";
                return 'black'
            })
        },
        {
            type: 'default',
            minZoom: displacementScale / 100,
            maxZoom: 40,
            altitude: 0.151,
            polygonResolution: 3,
            geojsonGenerator: worldGeoJsonGenerator,
            hexPolygonLabel: d => `<div style="width:100px;background-color:#191932;padding:15px;border-radius:5px;color:white">
            ${Math.round(d.properties.occupancy * 100)}% of land is sold
             </div>`
            ,
            hexPolygonColor: ((d) => {
                if (d.properties.occupancy < 0.2) return "rgba(0,0,256,0.1)";
                if (d.properties.occupancy < 0.4) return "rgba(0,0,256,0.6)";
                if (d.properties.occupancy < 0.6) return "orange";
                if (d.properties.occupancy < 1) return "red";
                return 'black'
            })
        },
    ]

    configs.forEach(config => {
        if (config.type == "default" && currentPolygonType == "default") return;

        if (altitude >= config.minZoom && altitude <= config.maxZoom) {
            currentPolygonType = config.type;
            const geojsonPromise = config.geojsonGenerator(Object.assign({ lat, lng, altitude }, config))

            geojsonPromise.then(geojson => {
                world
                    .hexPolygonsData(geojson.features)
                    .hexPolygonResolution(config.polygonResolution)
                    .hexPolygonMargin(0)
                    .hexPolygonAltitude(config.altitude)
                    .hexPolygonColor(config.hexPolygonColor)
                    .hexPolygonLabel(config.hexPolygonLabel)

                hideMessage();

            })


        }
    })

}


function showMessage(message, time) {
    if (!time) {
        d3.select('.messages')
            .style('opacity', 1)
            .html(message)
    } else {
        d3.select('.messages')
            .style('opacity', 1)
            .html(message)

        setTimeout(() => {
            hideMessage();
        }, time)
    }
}

function hideMessage() {
    d3.select('.messages').style('opacity', 0)
}

function checkButtonVisibility() {
    const keys = Object.entries(selectedLandPieces).filter(d => d[1]).map(d => d[0])
    if (keys.length) {
        d3.selectAll('.action-button').style('display', 'initial')
    } else {
        d3.selectAll('.action-button').style('display', 'none')
    }
    adjustVisibleHexPolygons(latestZoomState.data)
}