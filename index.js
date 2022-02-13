let world = null;
let displacementScale = 15;
let hexPolygonResolution = 3;  // https://h3geo.org/docs/core-library/restable/
let prevZoomState = {};
let latestZoomState = { data: { lat: 0, lng: 0, altitude: 2.5 }, time: new Date() };
let zoomTimeout = null;
let landFeatures = null;



initWorld()
initControls()
initDisplacement();
initLandAvailabilityLayer()
listenEvents();



function listenEvents() {
    document.addEventListener('imaginaryGlobeZoomEnd', zoomArgs => {
        adjustVisibleHexPolygons(zoomArgs.detail)
    })
}

function configureImaginaryGlobeZoomEndEvent(event) {
    prevZoomState = latestZoomState.data;
    latestZoomState.data = event
    roundLatLon(latestZoomState.data)
}

function roundLatLon(latLonObj) {
    let precision = 100000;
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
        .width(window.innerWidth - 40)
        .height(window.innerHeight - 40)
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
        world.globeImageUrl("./data/andromeda-high-mod.png");
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

        let timeoutTime = 100;
        zoomTimeOut = setTimeout(() => {
            const currentDate = new Date();
            const diff = currentDate - latestZoomState.time
            if (diff >= timeoutTime) {
                document.dispatchEvent(new CustomEvent('imaginaryGlobeZoomEnd', { detail: latestZoomState.data }));
            }

        }, timeoutTime)
    });

    world.onGlobeReady(() =>
        setTimeout(() => (world.controls().minDistance = 101))
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
            fetch("./data/splittedAreaData.json")
                .then((res) => res.json()),
            fetch("./data/splittedAreaH3R2.json")
                .then((res) => res.json()),
            fetch("./data/splittedAreaH3R3.json")
                .then((res) => res.json()),
        ]
    )
        .then((data) => {
            const countries = data[0]
            const features = countries.features.filter(
                (d) => !d.properties.inner
            );
            landFeatures = features;

            world
                .hexPolygonsData(features)
                .hexPolygonResolution(hexPolygonResolution)
                .hexPolygonMargin(0.03)
                .onHexPolygonHover(d => {
                    console.log('hex hovered', d)
                })
                .hexPolygonAltitude((d) => {
                    return 0.151;
                })
                .hexPolygonColor((d) => {
                    return 'rgba(129,71,252,0.2)'
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
    return;
    // if (JSON.stringify(prevZoomState) == JSON.stringify(latestZoomState.data)) {
    //     console.log('same location');
    //     return;
    // } else {
    //     console.log(JSON.stringify(prevZoomState), JSON.stringify(latestZoomState.data))
    // }

    function geojsonGenerator({ polygonResolution, kRingCount }) {
        const centerHex = h3.geoToH3(lat, lng, polygonResolution); // https://h3geo.org/docs/core-library/restable
        const kRing = h3.kRing(centerHex, kRingCount); // 10 Neighboring rings
        const geojson = geojsonRewind(h3SetToFeatureCollection(kRing));
        geojson.features.forEach((d) => { d.geometry.coordinates[0].reverse() })
        return geojson;
    }

    function worldGeoJsonGenerator() {

    }

    const configs = [
        {
            minZoom: 0.01,
            maxZoom: 0.05,
            polygonResolution: 7,
            kRingCount: 40,
            geojsonGenerator: geojsonGenerator
        },
        {
            minZoom: 0.05,
            maxZoom: displacementScale / 100,
            polygonResolution: 5,
            kRingCount: 40,
            geojsonGenerator: geojsonGenerator
        },
        // {
        //     minZoom: displacementScale / 100,
        //     maxZoom: 40,
        //     polygonResolution: 5,
        //     kRingCount: 40,
        //     geojsonGenerator: geojsonGenerator
        // },
    ]

    configs.forEach(config => {
        if (altitude > config.minZoom && altitude <= config.maxZoom) {
            const geojson = config.geojsonGenerator(config)
            world
                .hexPolygonsData(geojson.features)
                .hexPolygonResolution(config.polygonResolution)
                .hexPolygonMargin(0.03)
                .hexPolygonAltitude((d) => {
                    return 0.001;
                })
                .hexPolygonColor(() => Math.random() > 0.5 ? 'rgb(0,60,115)' : "rgba(0,255,255,0.2)");
        }
    })

}