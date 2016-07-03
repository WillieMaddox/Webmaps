controlMousePos = new ol.control.MousePosition({
	coordinateFormat: ol.coordinate.createStringXY(4),
});

popup = document.getElementById('popup');
$('#popup-closer').on('click', function() {
	overlayPopup.setPosition(undefined);
});
overlayPopup = new ol.Overlay({
	element: popup
});

var formatWFS = new ol.format.WFS();

var formatGML = new ol.format.GML({
    featureNS: 'http://argeomatica.com',
    featureType: 'playa_sample',
    srsName: 'EPSG:3857'
});

xs = new XMLSerializer();

sourceWFS = new ol.source.Vector({
    loader: function(extent) {
        $.ajax('http://geoserver-dbauszus.rhcloud.com/wfs', {
            type: 'GET',
            data: {
                service: 'WFS',
                version: '1.1.0',
                request: 'GetFeature',
                typename: 'playa_sample',
                srsname: 'EPSG:3857',
                bbox: extent.join(',') + ',EPSG:3857'
            },
        }).done(function(response) {
            sourceWFS.addFeatures(formatWFS.readFeatures(response))
        });
    },
    strategy: ol.loadingstrategy.tile(new ol.tilegrid.createXYZ({
        maxZoom: 19
    })),
});

var layerWFS = new ol.layer.Vector({
    source: sourceWFS
});

//hover highlight
selectPointerMove = new ol.interaction.Select({
	condition: ol.events.condition.pointerMove
});

layerOSM = new ol.layer.Tile({
	source: new ol.source.OSM()
});

var map = new ol.Map({
    target: 'map',
    overlays: [overlayPopup],
    controls: [controlMousePos],
    layers: [layerOSM, layerWFS],
    view: new ol.View({
        center: [-9692835, 2347907],
        zoom: 17
    })
});
map.addInteraction(selectPointerMove);

var interaction;
var select = new ol.interaction.Select({
	style: new ol.style.Style({
		stroke: new ol.style.Stroke({
			color: '#FF2828'
		})
	})
});

//wfs-t
var dirty = {};
var transactWFS = function(p, f) {
    switch (p) {
        case 'insert':
            node = formatWFS.writeTransaction([f], null, null, formatGML);
            break;
        case 'update':
            node = formatWFS.writeTransaction(null, [f], null, formatGML);
            break;
        case 'delete':
            node = formatWFS.writeTransaction(null, null, [f], formatGML);
            break;
    }

    if (f === undefined) {
    	console.log(p, f)
    } else {
    	console.log(p, f.getId())
    }

    payload = xs.serializeToString(node);
    console.log('**', payload);
    function responseCallback(response) {
    	var tr = formatWFS.readTransactionResponse(response);
    	ts = tr.transactionSummary;
        fid = tr.insertIds;
        console.log('****', ts, fid);
        
        switch (p) {
    		case 'insert':
    			if (ts.totalInserted === 1 && fid.length === 1 && fid[0] !== 'none') {
        			f.setId(fid[0])
    			}
				break;
    		case 'update':
    			break;
    		case 'delete':
    			if (ts.totalDeleted === 1 && fid.length === 1 && fid[0] === 'none') {
			    	sourceWFS.removeFeature(f);		            
    			}
    			break;
    	}
    }
    $.ajax('http://geoserver-dbauszus.rhcloud.com/wfs', {
        type: 'POST',
        dataType: 'xml',
        processData: false,
        contentType: 'text/xml',
        complete: function(xhr, status) {
        	if (status === 'success') {
        		responseCallback(xhr.responseXML)
        	} else {
        		console.log('STATUS ERROR', status)
        	}
        },
	    error: function(e) {
	    	var errorMsg = e? (e.status + ' ' + e.statusText) : "";
	    },
    
        data: payload
    }).done();
}

$('.btn-floating').hover(
	function() { $(this).addClass('darken-2'); },
	function() { $(this).removeClass('darken-2'); }
);

$('.btnMenu').on('click', function(event) {
    $('.btnMenu').removeClass('orange');
    $(this).addClass('orange');
    map.removeInteraction(interaction);
    select.getFeatures().clear();
    map.removeInteraction(select);
    switch ($(this).attr('id')) {

        case 'btnSelect':
            interaction = new ol.interaction.Select({
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: '#f50057', width: 2 })
                })
            });
            map.addInteraction(interaction);
            interaction.getFeatures().on('add', function(e) {
                props = e.element.getProperties();
                if (props.status) { $('#popup-status').html(props.status); } else { $('#popup-status').html('n/a'); }
                if (props.tiendas) { $('#popup-tiendas').html(props.tiendas); } else { $('#popup-tiendas').html('n/a'); }
                coord = $('.ol-mouse-position').html().split(',');
                overlayPopup.setPosition(coord);
                console.log(e.element.getId())
            });
            break;

        case 'btnEdit':
            map.addInteraction(select);
            interaction = new ol.interaction.Modify({
                features: select.getFeatures()
            });
            map.addInteraction(interaction);

            snap = new ol.interaction.Snap({
                source: layerWFS.getSource()
            });
            map.addInteraction(snap);

            dirty = {};
            select.getFeatures().on('add', function(e) {
                e.element.on('change', function(e) {
                    dirty[e.target.getId()] = true;
                });
            });
            select.getFeatures().on('remove', function(e) {
                f = e.element;
                if (dirty[f.getId()]) {
                    delete dirty[f.getId()];
                    featureProperties = f.getProperties();
                    delete featureProperties.boundedBy;
                    var clone = new ol.Feature(featureProperties);
                    clone.setId(f.getId());
                    transactWFS('update', clone);
                }
            });
            break;

        case 'btnDrawPoint':
            interaction = new ol.interaction.Draw({
                type: 'Point',
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function(e) {
                transactWFS('insert', e.feature);
            });
            break;

        case 'btnDrawLine':
            interaction = new ol.interaction.Draw({
                type: 'LineString',
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function(e) {
                transactWFS('insert', e.feature);
            });
            break;

        case 'btnDrawPoly':
            interaction = new ol.interaction.Draw({
                type: 'Polygon',
                source: layerWFS.getSource()
            });
            map.addInteraction(interaction);
            interaction.on('drawend', function(e) {
                transactWFS('insert', e.feature);
            });
            break;

        case 'btnDelete':
            interaction = new ol.interaction.Select();
            map.addInteraction(interaction);
            // interaction.getFeatures().on('change:length', function(e) {
            interaction.on('select', function(e) {
                if (e.selected.length == 1) {
                	transactWFS('delete', e.selected[0]);
			        interaction.getFeatures().clear();
			        selectPointerMove.getFeatures().clear();
            	}                
            });
            break;

        default:
            break;
    }
});

$('#btnZoomIn').on('click', function() {
	var view = map.getView();
	var newResolution = view.constrainResolution(view.getResolution(), 1);
	view.setResolution(newResolution);
});

$('#btnZoomOut').on('click', function() {
	var view = map.getView();
	var newResolution = view.constrainResolution(view.getResolution(), -1);
	view.setResolution(newResolution);
});
