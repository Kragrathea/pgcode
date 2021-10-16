$(function () {

        var self = this;

        //settings that are saved between sessions
        var PGSettings = function () {
            //this.showMirror=false;//default changed
            this.fatLines=true;//default changed
            this.showTravel=true;
            this.syncToProgress=true;
            this.orbitWhenIdle=false;
            this.antialias=true;
            this.lightTheme=false;
            this.saveCamera=false;
            this.perspectiveCamera=true;

            this.showNozzle=true;
            this.highlightCurrentLayer=true;
            this.show2d=true;
        };
        var pgSettings = new PGSettings();
        window.PGCSettings=pgSettings;


        //Scene globals
        var camera, cameraControls,cameraLight; 
        var scene, renderer; 
        var gcodeProxy;//used to display loaded gcode.

        var camera2d;

        var nozzleModel;
        var extrudingLineGroup;
        
        var clock;
        var sceneBounds = new THREE.Box3();
        //todo. Are these needed?
        var gcodeWid = 580;
        var gcodeHei = 580;
        var gui;

        var printHeadSim=new PrintHeadSimulator();


        var curGcodePath="";

        var forceNoSync=false;//used to override sync when user drags slider. Todo. Better way to handle this?
        
        var simPlaying =true;
        var playbackRate=1.0;

        var currentLayerNumber=0;

        var currentLayerCopy=null;//used for 2d view.
        var currentCalculatedLayer=0;

        //set to force render.
        var needRender = false;

        //handles fps display
        const stats = new Stats();
        
        var printerConnection=null;
        var camera2dDragging=false;
        var camera2dLastPos=null;

        let searchParams = new URLSearchParams(window.location.search)
        if(searchParams.has('embedded')){
            $(".pgconnection").hide();
            $("#pgclogo").hide();
        }
        $('#layer-slider').on('mousedown', function (e) {
            forceNoSync=true

        });
        $('#layer-slider').on('mouseup', function (e) {
            forceNoSync=false
        });
        $('#layer-slider').on('input', function (e) {
            if(parseInt(e.currentTarget.value))
            {    
                currentLayerNumber=parseInt(e.currentTarget.value)
                
                //todo. this seems hacky. better way?
                //currentCalculatedLayer=currentCalculatedLayer;
            }
            //simPlaying=false;
            //console.log(["layerSlider",currentLayerNumber])
        });


        $('#pgc2dcanvas').on('mousedown', function (e) {
            //console.log("md")
            camera2dLastPos={x:e.originalEvent.clientX,y:e.originalEvent.clientY}
            camera2dDragging=true;
        });
        $('body').on('mouseup', function (e) {
            //console.log("mu")
            camera2dDragging=false;
        });
        $('#pgc2dcanvas').on('mouseleave', function (e) {
            //console.log("mu")
            //camera2dDragging=false;
        });        
        $('body').on('mousemove', function (e) {
            if(camera2dDragging && camera2dLastPos!=null)
            {
                //console.log("drag")
                let dx= e.originalEvent.clientX-camera2dLastPos.x;
                let dy= e.originalEvent.clientY-camera2dLastPos.y;
                //console.log([dx,dy])
                camera2d.translateX(-dx/4);
                camera2d.translateY(dy/4);
                //console.log(camera2d.position)
                //camera2d.position.set(camera2d.position.x+=dx, camera2d.position.y+=dy, 500);
                camera2dLastPos={x:e.originalEvent.clientX,y:e.originalEvent.clientY}
                camera2d.updateProjectionMatrix();
                needRender=true;

                if(pgSettings.saveCamera)
                {
                    let camStr= JSON.stringify({pos:camera2d.position,zoom:camera2d.zoom});
                    localStorage.setItem('pgcCameraPos2d',camStr);
                };
            }
        });        
        $('#pgc2dcanvas').on('wheel', function (e) {

            camera2d.zoom +=  Math.sign(e.originalEvent.wheelDelta )/10
            if(camera2d.zoom<0.1)
                camera2d.zoom=0.1;
            camera2d.updateProjectionMatrix();
            needRender=true;

            if(pgSettings.saveCamera)
            {
                let camStr= JSON.stringify({pos:camera2d.position,zoom:camera2d.zoom});
                localStorage.setItem('pgcCameraPos2d',camStr);
            };
            //console.log(e)
        });
  

        $('#play-button').on('click', function (e) {
            simPlaying=!simPlaying;
            forceNoSync=false
            if(!simPlaying)
                $('#play-button').html("&#x25B6;")
            else
                $('#play-button').html("&#x23F8;")

        });
        $('#faster-button').on('click', function (e) {
            playbackRate=playbackRate*2;
            if(playbackRate>64)
                playbackRate=64;
        });           
        $('#slower-button').on('click', function (e) {
            playbackRate=playbackRate/2;
            if(playbackRate<0.125)
                playbackRate=0.125;
        });           
            


        var bedVolume = undefined;
        var viewInitialized = false;

        //Watch for bed volume changes
        self.onBedVolumeChange = function(){
            //get new build volume.
            updateBedVolume();
            //update scene if any
            updateGridMesh(); 

            //Needed in case center has changed.
            resetCamera();
        }

        $('#pgccanvas').on(
            'dragover',
            function(e) {
                e.preventDefault();
                e.stopPropagation();
            }
        )
        $('#pgccanvas').on(
            'dragenter',
            function(e) {
                e.preventDefault();
                e.stopPropagation();
            }
        )
        $('#pgccanvas').on(
            'drop',
            function(e){
                if(e.originalEvent.dataTransfer){
                    if(e.originalEvent.dataTransfer.files.length) {
                        e.preventDefault();
                        e.stopPropagation();
                        let files = e.originalEvent.dataTransfer.files;
                        //alert('Upload '+files.length+' File(s).');
                        let reader = new FileReader();
                        $("#status-name").html(files[0].name)
                        uploadGcode(files[0])
                        //            /*UPLOAD FILES HERE*/
                        //upload(e.originalEvent.dataTransfer.files);
                    }   
                }
            }
        );
                 
        function uploadGcode(file){
            forceDisconnect=true;
            updateJob(file)

        }
        window.uploadGcode=uploadGcode;

        function initGui()
        {
            //Connction dialog handling
            $(".pgconnection").on("click",function(event){
                let info=printerConnection.getConnectionInfo()
                $("input[name=server]").val(info.server)
                $("input[name=apikey]").val(info.apiKey)
                $("textarea[name=connection-log]").val(printerConnection.getLog().join("\n"))
                //todo. hook up autoconnect
                $("#connect-dialog").show()
            })
            $( "#connect-dialog" ).submit(function( event ) {
                //var data = $("#connect-dialog :input").serializeArray();

                let pgcServer= $("input[name=server]").val().trim()
                let pgcApiKey=$("input[name=apikey]").val().trim()


                console.log("Connection changed:"+[pgcServer, pgcApiKey])

                //if($("input[name=remember]").is(':checked'))
                if(true)// Always save for now
                {
                    if(pgcServer.length==0)
                        localStorage.removeItem("pgcServer")
                    else
                        localStorage.setItem("pgcServer",pgcServer);

                    if(pgcApiKey.length==0)
                        localStorage.removeItem("pgcApiKey")
                    else
                        localStorage.setItem("pgcApiKey",pgcApiKey);
                }else{
                    localStorage.removeItem("pgcServer",null);
                    localStorage.removeItem("pgcApiKey",null);                            
                }

                //always autoconnect for now.
                localStorage.setItem("pgcAutoConnect",true);
                // if($("input[name=autoconnect]").is(':checked'))
                // {
                //     localStorage.setItem("pgcAutoConnect",true);
                // }else{
                //     localStorage.setItem("pgcAutoConnect",false);
                // }  
                
                
                //alert( JSON.stringify(data) );
                $("#connect-dialog").hide()
                window.location.reload();
                event.preventDefault();
            });

            if(true){
                //simple gui
                dat.GUI.TEXT_OPEN="View Options"
                dat.GUI.TEXT_CLOSED="View Options"
                gui = new dat.GUI({ autoPlace: false,name:"View Options",closed:false,closeOnTop:true,useLocalStorage:true });
    
                //Override default storage location to fix bug with tabs.
                //Not working
                //gui.setLocalStorageHash("PrettyGCodeSettings");

                gui.useLocalStorage=true;
                // var guielem = $("<div id='mygui' style='position:absolute;right:95px;top:20px;opacity:0.8;z-index:5;'></div>");
    
                // $('.gwin').prepend(guielem)
    
                $('#mygui').append(gui.domElement);

                gui.remember(pgSettings);
                gui.add(pgSettings, 'syncToProgress').onFinishChange(function(){
                    if(pgSettings.syncToProgress){
                    }
                });

                gui.add(pgSettings, 'show2d').onFinishChange(function(){
                    if(pgSettings.show2d){
                        $('#pgc2dcanvas').show()
                    }else{
                        $('#pgc2dcanvas').hide()
                    }
                });
                if(pgSettings.show2d){
                    $('#pgc2dcanvas').show()
                }else{
                    $('#pgc2dcanvas').hide()
                }
                
                //gui.add(pgSettings, 'showMirror').onFinishChange(pgSettings.reloadGcode);
                gui.add(pgSettings, 'orbitWhenIdle');
                gui.add(pgSettings, 'showTravel');

                //gui.add(pgSettings, 'fatLines').onFinishChange(pgSettings.reloadGcode);
                //gui.add(pgSettings, 'reflections');
                // gui.add(pgSettings, 'antialias').onFinishChange(function(){
                //     new PNotify({
                //         title: "Reload page required",
                //         text: "Antialias chenges won't take effect until you refresh the page",
                //         type: "info"

                //         });
                //         //alert("Antialias chenges won't take effect until you refresh the page");
                //     });

                gui.add(pgSettings, 'showNozzle');
                    
                //gui.add(pgSettings, 'reloadGcode');
                gui.add(pgSettings, 'lightTheme').onFinishChange(function(){
                    if(pgSettings.lightTheme)
                        myScene.background = new THREE.Color(0xd0d0d0);
                    else
                        myScene.background = null;//new THREE.Color(0xd0d0d0);
                    
                });

                gui.add(pgSettings, 'saveCamera');

                //todo handle finish change for this
                gui.add(pgSettings, 'perspectiveCamera');
                

                var folder = gui.addFolder('Windows');//hidden.
                // folder.add(pgSettings, 'showState').onFinishChange(updateWindowStates).listen();
                // folder.add(pgSettings, 'showWebcam').onFinishChange(updateWindowStates).listen();
                // folder.add(pgSettings, 'showFiles').onFinishChange(updateWindowStates).listen();
                // folder.add(pgSettings, 'showDash').onFinishChange(updateWindowStates).listen();

                //dont show Windows. Automatically handled by toggle buttons
                $(folder.domElement).attr("hidden", true);

                $(".pgsettingstoggle").on("click", function () {
                    $("#mygui").toggleClass("pghidden");
                });

            } 
        }


        self.initScene = function () {
            if (!viewInitialized) {
                viewInitialized = true;

                updateBedVolume();
              
                initGui()

                printerConnection=new PrinterConnection()
                printerConnection.onUpdateState=function(newState)
                {
                    //todo. maybe put these two in animate()
                    //curPrinterState=newState.state;
                    //curPrintFilePos=newState.filePos;

                    if(newState.connected){
                        if(!$(".pgconnection").hasClass("connected"))
                            $(".pgconnection").addClass("connected")
                    }else{
                        if($(".pgconnection").hasClass("connected"))
                            $(".pgconnection").removeClass("connected")                        
                    }
                    $("#status-state").html(newState.state)
                    $("#status-elapsed").html(new Date(newState.printTime * 1000).toISOString().substr(11, 8))
                    $("#status-done").html(newState.perDone.toString()+"%")
                    if(newState.printTimeLeft)
                        $("#status-eta").html(new Date(newState.printTimeLeft * 1000).toISOString().substr(11, 8))

                    //todo. find another place for this?
                    if(gcodeProxy)
                        $("#status-layer").html(currentCalculatedLayer.toString()+"/"+gcodeProxy.getLayerCount())
    
                    if(curGcodePath!=newState.gcodePath && newState.gcodeName!="")
                    {
                        curGcodePath=newState.gcodePath;
                        let info=printerConnection.getConnectionInfo();
                        updateJob(newState.gcodePath,info.apiKey)
                        $("#status-name").html(newState.gcodeName)
                    }

                    if(newState.gcodeName && newState.gcodeName!="")
                        $("#status-name").html(newState.gcodeName)
                    else
                        $("#status-name").html("Nothing loaded")


                    //let lDelta=printHeadSim.getDeltaTo(newState.filePos).toString();
                    //console.log(["Behind ",lDelta])
                }

                if(true){
                    let defaultMoonrakerPort=7125
                    let pgcServer= localStorage.getItem("pgcServer");
                    let pgcApiKey=localStorage.getItem("pgcApiKey");
                    let pgcAutoConnect=localStorage.getItem("pgcAutoConnect");
                    if(pgcAutoConnect==null)//default to autoconnect
                        pgcAutoConnect=true;
                    if(pgcServer==null){
                        pgcServer=document.location.protocol+"//"+document.location.hostname+":"+defaultMoonrakerPort
                        console.log("No server configured. Trying default:"+pgcServer)
                        if(pgcServer.startsWith("file")){
                            pgcServer='http://fluiddpi.local:'+defaultMoonrakerPort;
                            console.log("Running from file. Setting file_url:"+pgcServer)
                        }
                    }else{
                        console.log("Configured server:"+pgcServer)
                    }
                
                    let searchParams = new URLSearchParams(window.location.search)
                    if(searchParams.has('server')){
                        pgcServer=searchParams.get("server")
                        console.log("Using server specified in url:"+pgcServer)
                    }
                    if(searchParams.has('apiKey'))
                        pgcApiKey=searchParams.get("apiKey")

                    if(pgcServer && pgcAutoConnect){
                        //printerConnection.connectToOctoprint(pgcServer,pgcApiKey)
                        printerConnection.detectConnection(pgcServer,pgcApiKey)
                        
                    }
                }
                initThree();

                //show fps unless url param "nofps"
                if(searchParams.has('fps'))
                {
                    stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
                    $("body").append( stats.dom );
                }
                

                //detectConnection();

                //connectToOctoprint()
                //connectToMoonraker();
                
                //GCode loader.
                // gcodeProxy = new GCodeObject2();
                // var gcodeObject = gcodeProxy.getObject();
                // gcodeObject.position.set(-0, -0, 0);
                // scene.add(gcodeObject);

                // if(curJobName!="")
                //     gcodeProxy.loadGcode('/downloads/files/local/' + curJobName);
                    
                //gcodeProxy.loadGcode('http://fluiddpi.local/server/files/gcodes/' + 'CCR10_xyzCalibration_cube.gcode?xx=1');
                //gcodeProxy.loadGcode('http://fluiddpi.local/server/files/gcodes/' + 'CCR10_3DBenchy-FAST.gcode?xx=1');


                    
            }
        }; 


        function resizeCanvasToDisplaySize() {
            const canvas = renderer.domElement;
            // look up the size the canvas is being displayed
            const width = canvas.clientWidth; 
            const height = canvas.clientHeight;

            // adjust displayBuffer size to match
            if (canvas.width !== width || canvas.height !== height) {
                // you must pass false here or three.js sadly fights the browser
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                gcodeWid = width;
                gcodeHei = height;
                cameraControls.setViewport(0, 0, width, height);
                return true;//update needed. 
            }
            return false;//no update needed
        }

        function initThree()
        {
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("pgccanvas"),antialias: pgSettings.antialias,alpha:true });
            //todo. is this right?
            renderer.setPixelRatio(window.devicePixelRatio);

            let frustumSize=50;
            const aspect = window.innerWidth / window.innerHeight;

            //init camera(s)
            if(pgSettings.perspectiveCamera)
                camera = new THREE.PerspectiveCamera(70, 2, 0.1, 10000);
            else
                camera = new THREE.OrthographicCamera( frustumSize * aspect / - 2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / - 2, 1, 1000 );

            camera.up.set(0,0,1);
            camera.position.set(bedVolume.width, 0, 50);

            CameraControls.install({ THREE: THREE });
            clock = new THREE.Clock();


            camera2d = new THREE.OrthographicCamera( frustumSize * aspect / - 2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / - 2, 1, 1000 );
            camera2d.up.set(0,1,0);

            if (bedVolume.origin == "lowerleft")
                camera2d.position.set(bedVolume.width/2, bedVolume.depth/2, 500);
            else
                camera2d.position.set(0, 0, 500);;

            

            var canvas = $("#pgccanvas");
            cameraControls = new CameraControls(camera, canvas[0]);

            resetCamera();

            if(pgSettings.saveCamera && localStorage.getItem('pgcCameraPos'))
            {
                var camStr=localStorage.getItem('pgcCameraPos');
                try{
                    var camPos = JSON.parse(camStr)
                    cameraControls.setPosition(camPos.pos.x,camPos.pos.y,camPos.pos.z)
                    cameraControls.setTarget(camPos.target.x,camPos.target.y,camPos.target.z)

                    camStr=localStorage.getItem('pgcCameraPos2d');
                    camPos = JSON.parse(camStr)
                    camera2d.position.set(camPos.pos.x,camPos.pos.y,camPos.pos.z);
                    if(camera2d.zoom)
                        camera2d.zoom=camPos.zoom;
                    camera2d.updateProjectionMatrix();

                }catch{}

            }

            //for debugging
            window.myCameraControls = cameraControls;

            //scene
            scene = new THREE.Scene();
            if(pgSettings.lightTheme)
                scene.background = new THREE.Color(0xd0d0d0);
            else
                scene.background = null;//new THREE.Color(0xd0d0d0);

            //for debugging
            window.myScene = scene;

            //add a light. might not be needed.
            var light = new THREE.PointLight(0xffffff);
            light.position.set(0, 0,-bedVolume.height);
            scene.add(light);

            cameraLight = new THREE.PointLight(0xffffff);
            cameraLight.position.copy(camera.position);
            scene.add(cameraLight);

            //Semi-transparent plane to represent the bed. 
            updateGridMesh();


            var syncSavedZ=0;
            var cameraIdleTime=0;
            var firstFrame=true;                 /*possible bug fix. this might not be needed.*/

            //material for fatline highlighter
            var highlightMaterial = undefined;
                        
            if(pgSettings.fatLines)
            {
                highlightMaterial=new THREE.LineMaterial({
                    linewidth: 3, // in pixels
                    //transparent: true,
                    //opacity: 0.5,
                    //color: new THREE.Color(curColorHex),// rainbow.getColor(layers.length % 64).getHex()
                    vertexColors: THREE.VertexColors,
                });
                highlightMaterial.resolution.set(window.innerWidth, window.innerHeight);
            }else{
                //highlightMaterial=
            }

            if(false){
            //load Nozzle model.
                var objloader = new THREE.OBJLoader();
                objloader.load( './js/models/ExtruderNozzle.obj', function ( obj ) {
                    obj.quaternion.setFromEuler(new THREE.Euler( Math.PI / 2, 0, 0));
                    obj.scale.setScalar(0.1)
                    obj.position.set(0, 0, 10);
                    obj.name="nozzle";
                    var nozzleMaterial = new THREE.MeshStandardMaterial( {
                        metalness: 1,   // between 0 and 1
                        roughness: 0.5, // between 0 and 1
                        //envMap: cubeCamera.renderTarget.texture,
                        color: new THREE.Color(0xba971b),
                        //flatShading:false,
                    } );
                    obj.children.forEach(function(e,i){
                        if ( e instanceof THREE.Mesh ) {
                            e.material = nozzleMaterial;
                            //e.geometry.computeVertexNormals();
                        }
                    })
                    nozzleModel=obj;
                    scene.add( nozzleModel );
                });
                    
            }else{
                var nozzleGroup = new THREE.Group();
                //let geometry = new THREE.ConeGeometry( 5, 6, 32 );
                let geometry = new THREE.CylinderGeometry( 0.3,4.4, 3, 16 );
                //geometry.computeVertexNormals()
                //const material = new THREE.MeshBasicMaterial( {color: 0xffff00} );
                let nozzleMaterial = new THREE.MeshStandardMaterial( {
                    //metalness: 0.1,   // between 0 and 1
                    //roughness: 0.5, // between 0 and 1
                    //envMap: cubeCamera.renderTarget.texture,
                    color: new THREE.Color(0xba971b),
                    transparent:true,
                    opacity:0.50,
                    //flatShading:true,
                } );
                let cone = new THREE.Mesh( geometry, nozzleMaterial );
                cone.rotation.x = -Math.PI / 2;
                cone.position.z = 1.5;

                geometry = new THREE.CylinderGeometry( 4.4,4.4, 4, 16 );
                //geometry.computeVertexNormals()
                let nutMaterial = new THREE.MeshStandardMaterial( {
                    //metalness: 0.1,   // between 0 and 1
                    //roughness: 0.5, // between 0 and 1
                    //envMap: cubeCamera.renderTarget.texture,
                    color: new THREE.Color(0xba971b),
                    flatShading:false,
                    transparent:true,
                    opacity:0.50                    
                } );
                let nut =new THREE.Mesh( geometry, nutMaterial );
                nut.rotation.x = -Math.PI / 2;
                nut.position.z = 5;
                

                nozzleGroup.add(cone)
                nozzleGroup.add(nut)
                nozzleModel=nozzleGroup;
                scene.add( nozzleGroup );
            }

            //create a cyl to be extruded segment
            extrudingLineGroup = new THREE.Group();

            geometry = new THREE.CylinderGeometry( 0.2,0.2, 1, 12 );
            let extrudingLineMaterial = new THREE.MeshStandardMaterial( {
                //metalness: 1,   // between 0 and 1
                //roughness: 0.5, // between 0 and 1
                //envMap: cubeCamera.renderTarget.texture,
                color: new THREE.Color("red"),
                emissive:new THREE.Color("blue")
                //flatShading:true,
            } );                

                
            let extrudingLine =new THREE.Mesh( geometry, extrudingLineMaterial );
            //extrudingLine.position.y = -1;
            extrudingLine.scale.y=2;
            extrudingLine.rotation.x = -Math.PI / 2;
            //extrudingLine.position.y = -10;

            extrudingLineGroup.add(extrudingLine)

            scene.add( extrudingLineGroup );
                
            function animate() {

                stats.begin();

                const delta = clock.getDelta();
                const elapsed = clock.getElapsedTime();

                /*possible bug fix. this might not be needed.*/
                if(firstFrame)
                {
                    needRender=true;
                    firstFrame=false;
                }

                //get connection state and filepos.
                var pstate = printerConnection.getState();

                let curPrinterState=pstate.state;
                let curPrintFilePos=pstate.filePos;

                let curSimFilePos=0;//

                if(printHeadSim && simPlaying)
                {



                    // }
                    //todo. stop when past end.

                    let lDelta=printHeadSim.getDeltaTo(curPrintFilePos);
//                    let linesBehind= lDelta.distance;
                    let linesBehind= lDelta.lines;

                    if(linesBehind>300 || linesBehind<0){
                        console.log(["Seeking. linesBehind:",linesBehind])
                        printHeadSim.setCurPosition(curPrintFilePos)
                        linesBehind=0;
                    }

                    //printHeadSim.updatePosition(delta*playbackRate);
                    printHeadSim.updatePosition2(delta,1.0,linesBehind,curPrintFilePos);

                    var curState=printHeadSim.getCurPosition();
                    if(curState.filePos)
                        curSimFilePos=curState.filePos;

                    //console.log(fpDelta)

                }
                if(curPrinterState && (curPrinterState.startsWith("printing") || curPrinterState=="paused") && 
                    pgSettings.syncToProgress && (!forceNoSync))
//if(!forceNoSync || )
                {
                    if(nozzleModel && printHeadSim)
                    {
                        var curState=printHeadSim.getCurPosition();
                        nozzleModel.position.copy(curState.position);
                        
                        //Position a cylinder to represent the segment being extruding
                        if(extrudingLineGroup && curState.startPoint)
                        {
                            if(!curState.extrude)
                                extrudingLineGroup.visible=false;
                            else{
                                extrudingLineGroup.visible=true;
                                var vectToCurEnd=curState.position.clone().sub(curState.startPoint);
                                var dist=vectToCurEnd.length();
                                if(dist<0.0001)
                                {    
                                    dist=0.0001; //fix 0 distance bug.
                                    //console.log("here")
                                }
                                extrudingLineGroup.children[0].scale.y=dist;
                                extrudingLineGroup.position.copy(curState.startPoint);

                                vectToCurEnd.setLength(dist/2);
                                extrudingLineGroup.position.add(vectToCurEnd);  
                                extrudingLineGroup.lookAt(curState.position);
                            }
                        }    
                        needRender=true;
                    }
                    if(gcodeProxy)
                    {
                        currentCalculatedLayer = gcodeProxy.syncGcodeObjToFilePos(curSimFilePos);
                        if(highlightMaterial!==undefined){
                            gcodeProxy.highlightLayer(currentCalculatedLayer,highlightMaterial);
                        }

                        $('#layer-slider')[0].value=currentCalculatedLayer;

                        //$("#myslider-vertical").slider('setValue', calculatedLayer, false,true);
                        //$("#myslider .slider-handle").text(calculatedLayer);

                        needRender=true;
                    }
                }else{
                    if(nozzleModel && nozzleModel.position.lengthSq()){
                        nozzleModel.position.set(0,0,0);//todo. hide instead/also?
                        needRender=true;
                    }

                    if(gcodeProxy){
                        //todo. this should be somewhere else

                        if($('#layer-slider').attr("max")!=gcodeProxy.getLayers().length){
                            $('#layer-slider').attr("max",gcodeProxy.getLayers().length)
                            $('#layer-slider').attr("value",gcodeProxy.getLayers().length)
                            currentLayerNumber=gcodeProxy.getLayers().length;
                        }

                        if( gcodeProxy.syncGcodeObjToLayer(currentLayerNumber) )
                            {
                                if(highlightMaterial!==undefined){
                                    gcodeProxy.highlightLayer(currentLayerNumber,highlightMaterial);
                                }
                                needRender=true;
                                //console.log("GCode Proxy needs update");
                            }
                    }

                }

                //show or hide nozzle based on settings.
                if(nozzleModel && nozzleModel.visible!= pgSettings.showNozzle){
                    nozzleModel.visible= pgSettings.showNozzle;
                    needRender=true;
                }

                if(highlightMaterial!==undefined){
                    //fake a glow by ramping the diffuse color.
                    let nv = 0.5+((Math.sin(elapsed*4)+1)/4.0); 
                    nv=1.0;
                    highlightMaterial.uniforms.diffuse.value.r=nv;
                    highlightMaterial.uniforms.diffuse.value.g=nv;
                    highlightMaterial.uniforms.diffuse.value.b=nv;
                }

                cameraControls.dollyToCursor = true;//todo. needed every frame?
                const updated = cameraControls.update(delta);//handle mouse/keyboard etc.
                if(updated)//did user move the camera?
                {
                    cameraIdleTime=0;
                    needRender=true;
                                //if()
                    if(pgSettings.saveCamera)
                    {
                        let camStr= JSON.stringify({pos:cameraControls.getPosition(),target:cameraControls.getTarget()});
                        localStorage.setItem('pgcCameraPos',camStr);
                    }
                }
                else{
                    cameraIdleTime+=delta;
                    if(pgSettings.orbitWhenIdle && cameraIdleTime>5)
                    {
                        cameraControls.rotate(delta/5.0,0,false);//auto orbit camera a bit.
                        cameraControls.update(delta);//force update so it wont look like manual move next frame.
                        needRender=true;
                    }
                }

                if(cameraLight)
                {
                    cameraLight.position.copy(camera.position);
                }
                
                if(resizeCanvasToDisplaySize())
                    needRender=true;

                if(needRender)
                {
                    let left =0;
                    let bottom = 0;
                    let width=window.innerWidth
                    let height=window.innerHeight
                    //renderer.setScissor( 10, 10, window.innerWidth/4, window.innerHeight/4 );
                    renderer.setViewport( left, bottom, width, height );
					renderer.setScissor( left, bottom, width, height );
					renderer.setScissorTest( true );

                    renderer.setScissor( 0, 0, window.innerWidth, window.innerHeight );
                    renderer.render(scene, camera);
                    

                    if(pgSettings.show2d){
                        width=window.innerWidth/4
                        height=window.innerHeight/4
                        // left =window.innerWidth-width-50;
                        // bottom = 20;
                        bottom =window.innerHeight-height-50;
                        left = 20;


                        //renderer.setScissor( 10, 10, window.innerWidth/4, window.innerHeight/4 );
                        renderer.setViewport( left, bottom, width, height );
                        renderer.setScissor( left, bottom, width, height );
                        renderer.setScissorTest( true );
                        //renderer.setClearColor( view.background );
                        camera2d.up.set(0,1,0);
                        //camera2d.position.set(bedVolume.width/2, bedVolume.depth/2, 500);

                        if(gcodeProxy)
                        {
                            //todo. better way to do this.
                            //if using the slider to seek then use slider for layer number.
                            if(forceNoSync)
                                currentCalculatedLayer=currentLayerNumber;

                             gcodeProxy.hideAllBeforeLayer(currentCalculatedLayer);//sync to layer but hide all before current

                        }
                        let gcodeObject =null;
                        if(gcodeProxy){
                            gcodeObject = gcodeProxy.getObject();
                        }

                        if(nozzleModel)
                            nozzleModel.visible=false;
                        renderer.render(scene, camera2d);
                        if(nozzleModel)
                            nozzleModel.visible= pgSettings.showNozzle;
                    }
                }else{
                    //console.log("idle");
                }

                stats.end();
                requestAnimationFrame(animate);
            }

            animate();
        }

        function startPlaybackAdjuster()
        {

            setInterval(function () {

                //get connection state and filepos.
                var pstate = printerConnection.getState();

                let curPrinterState=pstate.state;
                let curPrintFilePos=pstate.filePos;

                let curState=printHeadSim.getCurPosition();
                let curSimFilePos=curState.filePos;


                //adapt playback rate
                var fpDelta=curPrintFilePos-curSimFilePos;

                if(fpDelta>30000 || fpDelta<-800){
                    let lDelta=printHeadSim.getDeltaTo(curPrintFilePos).toString();
                    console.log(["Seeking ",playbackRate,lDelta,fpDelta])
                    //console.log(["Behind ",lDelta])

                    printHeadSim.setCurPosition(curPrintFilePos-300)
                    fpDelta=0;
                    playbackRate=0.9
                }else if(fpDelta<0){
                    let lDelta=printHeadSim.getDeltaTo(curPrintFilePos).toString();
                    //console.log(["Pause ",playbackRate,lDelta,fpDelta])
                    playbackRate=0;//just pause if still under
                }
                else 
                if(fpDelta>500)
                {
                    playbackRate=0.9+(fpDelta/1000.0);
                    //console.log(["Slow ",playbackRate,lDelta,fpDelta])
                }else 
                if(fpDelta<200 && fpDelta>0)
                {
                    playbackRate=0.5-(1.0/fpDelta);
                    //console.log(["Fast ",playbackRate,lDelta,fpDelta])
                }else{
                    //console.log(["OK ",playbackRate,lDelta,fpDelta])

                }             
                
                if(playbackRate<0)
                    playbackRate=0;
                if(playbackRate>100)
                    playbackRate=100;                    

            }, 500);  

        }
        //startPlaybackAdjuster()


        function startPlaybackStats()
        {

            let lastFilePos=0;
            let lastPrintTime=0;
            let interval=2*1000;
            setInterval(function () {

                //get connection state and filepos.
                var pstate = printerConnection.getState();

                let curPrinterState=pstate.state;
                let curPrintFilePos=pstate.filePos;

                let curState=printHeadSim.getCurPosition();
                let curSimFilePos=curState.filePos;


                //adapt playback rate
                var fpDelta=curPrintFilePos-curSimFilePos;

                //let lDelta=printHeadSim.getDeltaTo(curPrintFilePos);
                let behind=printHeadSim.getDeltaFromTo(lastFilePos,curPrintFilePos);
                console.log("Behind Stats:"+JSON.stringify(behind))

                let total=printHeadSim.getDeltaFromTo(0,curPrintFilePos);
                total.printTime=pstate.printTime;
                total.actualRate=(total.distance/total.printTime)*60;
                console.log("Total Stats:"+JSON.stringify(total))
                lastFilePos=curPrintFilePos;


            }, interval);  

        }
        //let searchParams = new URLSearchParams(window.location.search)
        if(searchParams.has('playstats'))
            startPlaybackStats()

        function resetCamera() {

            if(!cameraControls)//Make sure controls exist. 
                return;

            if (bedVolume.origin == "lowerleft")
                cameraControls.setTarget(bedVolume.width / 2, bedVolume.depth / 2, 0, false);
            else
                cameraControls.setTarget(0, 0, 0, false);
        }

        function updateBedVolume() {

            //todo.
            bedVolume = {
                width: 300,
                height: 700,
                depth: 300,
                origin: "lowerleft",
                formFactor: "",//todo
            };

            let searchParams = new URLSearchParams(window.location.search)
            if(searchParams.has('bed.width'))
                bedVolume.width=parseInt(searchParams.get('bed.width'))
            if(searchParams.has('bed.depth'))
                bedVolume.depth=parseInt(searchParams.get('bed.depth'))
            if(searchParams.has('bed.height'))
                bedVolume.height=parseInt(searchParams.get('bed.height'))
            if(searchParams.has('bed.origin'))
                bedVolume.origin=searchParams.get('bed.origin')



            return;


            //var volume = ko.mapping.toJS(self.printerProfiles.currentProfileData().volume);
            var volume = self.printerProfiles.currentProfileData().volume;
            //console.log([arguments.callee.name,volume]);

            if (typeof volume.custom_box === "function") //check for custom bounds.
            {
                bedVolume = {
                    width: volume.width(),
                    height: volume.height(),
                    depth: volume.depth(),
                    origin: volume.origin(),
                    formFactor: volume.formFactor(),
                };
            }
            else {
                //console.log(["volume.custom_box",volume.custom_box]);
                bedVolume = {
                    width: volume.custom_box.x_max() - volume.custom_box.x_min(),
                    height: volume.custom_box.z_max() - volume.custom_box.z_min(),
                    depth: volume.custom_box.y_max() - volume.custom_box.y_min(),
                    origin: volume.origin(),
                    formFactor: volume.formFactor(),
                };
            }
        }


        function updateGridMesh(){
            //console.log("updateGridMesh");

            if(!scene)//scene loaded yet?
                return;

            var existingPlane = scene.getObjectByName("plane");
            if(existingPlane)
                scene.remove( existingPlane );
            var existingGrid = scene.getObjectByName("grid");
            if(existingGrid)
                scene.remove( existingGrid );
                
            //console.log([existingPlane,existingGrid]);
            
            var planeGeometry = new THREE.PlaneGeometry(bedVolume.width, bedVolume.depth);
            var planeMaterial = new THREE.MeshBasicMaterial({
            color: 0x909090,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.2,
            });
            var plane = new THREE.Mesh(planeGeometry, planeMaterial);
            plane.name="plane";
            //todo handle other than lowerleft
            if (bedVolume.origin == "lowerleft")
                plane.position.set(bedVolume.width / 2, bedVolume.depth / 2, -0.1);
            //plane.quaternion.setFromEuler(new THREE.Euler(- Math.PI / 2, 0, 0));
            scene.add(plane);
            //make bed sized grid. 
            var grid = new THREE.GridHelper(bedVolume.width, bedVolume.depth / 10, 0x000000, 0x888888);
            grid.name="grid";
            //todo handle other than lowerleft
            if (bedVolume.origin == "lowerleft")
                grid.position.set(bedVolume.width / 2, bedVolume.depth / 2, 0);
            //if (pgSettings.transparency){
            grid.material.opacity = 0.6;
            grid.material.transparent = true;
            grid.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
            scene.add(grid);
        }
        //currently loaded gcode
        var curJobName="";
        var durJobDate=0;//use date of file to check for update.
        
        //rename to loadGcode or something.
        function updateJob(job,apiKey){
            
            if(job instanceof File)
            {
                if(viewInitialized){
                    curJobName=job.name

                    if(currentLayerCopy)
                        myScene.remove(currentLayerCopy)
                    currentLayerCopy=null;

                    if(gcodeProxy){
                        gcodeProxy.reset();
                    }

                    printHeadSim=new PrintHeadSimulator();
                    gcodeProxy = printHeadSim.getGcodeObject();
                    var gcodeObject = gcodeProxy.getObject();
                    gcodeObject.position.set(-0, -0, 0);
                    scene.add(gcodeObject);

                    printHeadSim.loadGcodeLocal(job,apiKey);
                }
                return;
            }

            // if (durJobDate != job.file.date) {
            //     curJobName = job.file.path;
            //     durJobDate = job.file.date;
            if(curJobName!=job){
                if(viewInitialized);// && gcodeProxy)
                    {
                        curJobName=job

                        
                        if(currentLayerCopy)
                            myScene.remove(currentLayerCopy)
                        currentLayerCopy=null;


                        if(gcodeProxy){
                            gcodeProxy.reset();
                        }

                        printHeadSim=new PrintHeadSimulator();
                        gcodeProxy = printHeadSim.getGcodeObject();
                        var gcodeObject = gcodeProxy.getObject();
                        gcodeObject.position.set(-0, -0, 0);
                        scene.add(gcodeObject);

                        printHeadSim.loadGcode(curJobName,apiKey);

                        //terminalGcodeProxy = new GCodeParser();
                        //terminalGcodeProxy;//used to display gcode actualy sent to printer.
                    }
            }

        }

        self.initScene();

});


