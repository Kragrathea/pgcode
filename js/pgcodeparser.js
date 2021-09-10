//make class
{
    /* Arc Interpolation Parameters */
    self.mm_per_arc_segment = 1.0;  // The absolute longest length of an interpolated segment
    self.min_arc_segments = 20;  // The minimum number of interpolated segments in a full circle, 0 to disable
    // The absolute minimum length of an interpolated segment.
    // Limited by mm_per_arc_segment as a max and min_arc_segments as a minimum, 0 to disable
    self.min_mm_per_arc_segment = 0.1;
    // This controls how many arcs will be drawn before the exact position of the
    // next segment is recalculated.  Reduces the number of sin/cos calls.
    // 0 to disable
    self.n_arc_correction = 24;

    // A function to interpolate arcs into straight segments.  Returns an array of positions
    self.interpolateArc = function (state, arc) {
        // This is adapted from the Marlin arc interpolation routine found at
        // https://github.com/MarlinFirmware/Marlin/
        // The license can be found here: https://github.com/MarlinFirmware/Marlin/blob/2.0.x/LICENSE
        // This allows the rendered arcs to be VERY close to what would be printed,
        // depending on the firmware settings.

        // Create vars to hold the initial and current position so we don't affect the state
        var initial_position = {}, current_position = {};
        Object.assign(initial_position, state)
        Object.assign(current_position, state)
        // Create the results which contain the copied initial position
        var interpolated_segments = [initial_position];

        // note that arc.is_clockwise determines if this is a G2, else it is a G3
        // I'm going to also extract all the necessary variables up front to make this easier
        // to convert from the source c++ arc interpolation code

        // Convert r format to i j format if necessary
        // I have no code like this to test, so I am not 100% sure this will work as expected
        // commenting out for now
        /*
        if (arc.r)
        {

            if (arc.x != current_position.x || arc.y != current_position.y) {
                var vector = {x: (arc.x - current_position.x)/2.0, y: (arc.y - current_position.y)/2.0};
                var e = arc.is_clockwise ^ (arc.r < 0) ? -1 : 1;
                var len = Math.sqrt(Math.pow(vector.x,2) + Math.pow(vector.y,2));
                var h2 = (arc.r - len) * (arc.r + len);
                var h = (h2 >= 0) ? Math.sqrt(h2) : 0.0;
                var bisector = {x: -1.0*vector.y, y: vector.x };
                arc.i = (vector.x + bisector.x) / len * e * h;
                arc.j = (vector.y + bisector.y) / len * e * h;
            }
        }*/

        // Calculate the radius, we will be using it a lot.
        var radius = Math.hypot(arc.i, arc.j);
        // Radius Vector
        var v_radius = {x: -1.0 * arc.i, y: -1.0 * arc.j};
        // Center of arc
        var center = {x: current_position.x - v_radius.x, y: current_position.y - v_radius.y};
        // Z Travel Total
        var travel_z = arc.z - current_position.z;
        // Extruder Travel
        var travel_e = arc.e - current_position.e;
        // Radius Target Vector
        var v_radius_target = {x: arc.x - center.x, y: arc.y - center.y};

        var angular_travel_total = Math.atan2(
        v_radius.x * v_radius_target.y - v_radius.y * v_radius_target.x,
            v_radius.x * v_radius_target.x + v_radius.y * v_radius_target.y
        );
        // Having a positive angle is convenient here.  We will make it negative later
        // if we need to.
        if (angular_travel_total < 0) { angular_travel_total += 2.0 * Math.PI}

        // Copy our mm_per_arc_segments var because we may be modifying it for this arc
        var mm_per_arc_segment = self.mm_per_arc_segment;

        // Enforce min_arc_segments if it is greater than 0
        if (self.min_arc_segments > 0) {
            mm_per_arc_segment = (radius * ((2.0 * Math.PI) / self.min_arc_segments));
            // We will need to enforce our max segment length later, flag this
        }

        // Enforce the minimum segment length if it is set
        if (self.min_mm_per_arc_segment > 0)
        {
            if (mm_per_arc_segment < self.min_mm_per_arc_segment) {
                mm_per_arc_segment = self.min_mm_per_arc_segment;
            }
        }

        // Enforce the maximum segment length
        if (mm_per_arc_segment > self.mm_per_arc_segment) {
            mm_per_arc_segment = self.mm_per_arc_segment;
        }

        // Adjust the angular travel if the direction is clockwise
        if (arc.is_clockwise) { angular_travel_total -= (2.0 * Math.PI); }

        // Compensate for a full circle, which would give us an angle of 0 here
        // We want that to be 2Pi.  Note, full circles are bad in 3d printing, but they
        // should still render correctly
        if (current_position.x == arc.x && current_position.y == arc.y && angular_travel_total == 0)
        {
            angular_travel_total += 2.0 * Math.PI;
        }

        // Now it's time to calculate the mm of total travel along the arc, making sure we take Z into account
        var mm_of_travel_arc = Math.hypot(angular_travel_total * radius, Math.abs(travel_z));

        // Get the number of segments total we will be generating
        var num_segments = Math.ceil(mm_of_travel_arc / mm_per_arc_segment);

        // Calculate xy_segment_theta, z_segment_theta, and e_segment_theta
        // This is the distance we will be moving for each interpolated segment
        var xy_segment_theta = angular_travel_total / num_segments;
        var z_segment_theta = travel_z / num_segments;
        var e_segment_theta = travel_e / num_segments;

        // Time to interpolate!
        if (num_segments > 1)
        {
            // it's possible for num_segments to be zero.  If that's true, we just need to draw a line
            // from the start to the end coordinates, and this isn't needed.

            // I am NOT going to use the small angel approximation for sin and cos here, but it
            // could be easily added if performance is a problem.  Here is code for this if it becomes
            // necessary:
            //var sq_theta_per_segment = theta_per_segment * theta_per_segment;
            //var sin_T = theta_per_segment - sq_theta_per_segment * theta_per_segment / 6;
            //var cos_T = 1 - 0.5f * sq_theta_per_segment; // Small angle approximation
            var cos_t = Math.cos(xy_segment_theta);
            var sin_t = Math.sin(xy_segment_theta);
            var r_axisi;

            // We are going to correct sin and cos only occasionally to reduce cpu usage
            var count = 0;
            // Loop through each interpolated segment, minus the endpoint which will be handled separately
            for (var i = 1; i < num_segments; i++) {

                if (count < self.n_arc_correction)
                {
                    // not time to recalculate X and Y.
                    // Apply the rotational vector
                    r_axisi = v_radius.x * sin_t + v_radius.y * cos_t;
                    v_radius.x = v_radius.x * cos_t - v_radius.y * sin_t;
                    v_radius.y = r_axisi;
                    count++;
                }
                else
                {
                    // Arc correction to radius vector. Computed only every N_ARC_CORRECTION increments.
                    // Compute exact location by applying transformation matrix from initial radius vector(=-offset).
                    var sin_ti = Math.sin(i * xy_segment_theta);
                    var cos_ti = Math.cos(i * xy_segment_theta);
                    v_radius.x = (-1.0 * arc.i) * cos_ti + arc.j * sin_ti;
                    v_radius.y = (-1.0 * arc.i) * sin_ti - arc.j * cos_ti;
                    count = 0;
                }

                // Draw the segment
                var line = {
                    x: center.x + v_radius.x,
                    y: center.y + v_radius.y,
                    z: current_position.z + z_segment_theta,
                    e: current_position.e + e_segment_theta,
                    f: arc.f
                };
                /*console.debug(
                    "Arc Segment " + i.toString() + ":" +
                    " X" + line.x.toString() +
                    " Y" + line.y.toString() +
                    " Z" + line.z.toString() +
                    " E" + line.e.toString() +
                    " F" + line.f.toString()
                );*/
                interpolated_segments.push(line);

                // Update the current state
                current_position.x = line.x;
                current_position.y = line.y;
                current_position.z = line.z;
                current_position.e = line.e;
            }
        }
        // Move to the target position
        var line = {
            x: arc.x,
            y: arc.y,
            z: arc.z,
            e: arc.e,
            f: arc.f
        };
        interpolated_segments.push(line);
        //Done!!!
        return interpolated_segments;
    };
}


function GCodeObject3(settings=null) {

    var parserSettings={
        fatLines:true,
        showTravel:false
    }
    if(settings!=null)
        parserSettings=settings;
    window.myViewSettings=parserSettings;

    var state = { x: 0, y: 0, z: 0, e: 0, f: 0, extruding: false, relative: false };
    var layers = [];
    
    var currentLayer = undefined;

    var defaultColor = new THREE.Color('white');
    var curColor = defaultColor;
    var filePos=0;//used for syncing when printing.

    var previousPiece = "";//used for parsing gcode in chunks.

    //material for fatlines
    var curMaterial = new THREE.LineMaterial({
        linewidth: 3, // in pixels
        vertexColors: THREE.VertexColors,
    });
    //todo. handle window resize
//            curMaterial.resolution.set(gcodeWid, gcodeHei);
    curMaterial.resolution.set(window.innerWidth, window.innerHeight);

    //for plain lines
    var curLineBasicMaterial = new THREE.LineBasicMaterial( {
        color: 0xffffff,
        vertexColors: THREE.VertexColors
    } );

    var gcodeGroup = new THREE.Group();
    gcodeGroup.name = 'gcode';

    //reset parser for another object.
    this.reset=function()
    {
        this.clearObject();
        state = { x: 0, y: 0, z: 0, e: 0, f: 0, extruding: false, relative: false };
        layers = [];
        currentLayer = undefined;
        curColor = defaultColor;
        filePos=0;
        previousPiece = "";
    }
    this.getObject = function () {
        return gcodeGroup;
    }
   
    this.clearObject= function () {
        if(gcodeGroup){
            for (var i = gcodeGroup.children.length - 1; i >= 0; i--) {
                gcodeGroup.remove(gcodeGroup.children[i]);
            }            
        }
    }
    this.getLayers = function () {
        return layers;
    }
    this.getLayerCount = function () {
        return layers.length;
    }    
    this.getLayerObject = function (layerNumber) {
        let result = null;
        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                if (child.userData.layerNumber==layerNumber && !child.userData.isTravel) {
                    result=child;
                }
            }
        })
        return result;
    }

    this.highlightLayer=function (layerNumber,highlightMaterial)
    {
        var needUpdate=false;//only need update if visiblity changes
        var defaultMat=curLineBasicMaterial;
        if(parserSettings.fatLines){
            defaultMat=curMaterial;
        }

        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                if(child.userData.isTravel){
                    //dont update material for travels

                }else if (child.userData.layerNumber<layerNumber) {
                    if(child.material.uuid!=defaultMat.uuid)
                    {
                        child.material=defaultMat;
                        needUpdate=true;
                    }
                }else if (child.userData.layerNumber==layerNumber) {
                    if(child.material.uuid!=highlightMaterial.uuid)
                    {
                        child.material=highlightMaterial;
                        needUpdate=true;
                    }
                }
                else {
                    if(child.material.uuid!=defaultMat.uuid)
                    {
                        child.material=defaultMat;
                        needUpdate=true;
                    }
                }
            }
        });
        return(needUpdate);
    }
    this.hideAllBeforeLayer=function (layerNumber)
    {
        var needUpdate=false;//only need update if visiblity changes

        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                if (child.userData.layerNumber<layerNumber) {

                    if(child.visible)// || child.geometry.maxInstancedCount!=child.userData.numLines)
                        needUpdate = true;

                    child.visible = false;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    //child.geometry.maxInstancedCount=child.userData.numLines;
                }
            }
        });
        return(needUpdate);
    }
    this.syncGcodeObjToLayer=function (layerNumber,lineNumber=Infinity,hideBefore=false)
    {
        var needUpdate=false;//only need update if visiblity changes

        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                if (child.userData.layerNumber<layerNumber) {

                    if(!child.visible || child.geometry.maxInstancedCount!=child.userData.numLines)
                        needUpdate = true;

                    child.visible = true;

                    if(hideBefore)//for just showing current layer 
                        child.visible=false;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    child.geometry.maxInstancedCount=child.userData.numLines;
                }else if (child.userData.layerNumber==layerNumber) {
                    if(!child.visible || child.geometry.maxInstancedCount!=Math.min(lineNumber,child.userData.numLines))
                        needUpdate = true;

                    child.visible = true;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    child.geometry.maxInstancedCount=Math.min(lineNumber,child.userData.numLines);
                }
                else {
                    if(child.visible)
                        needUpdate = true;

                    child.visible = false;
                }
            }
        });
        return(needUpdate);
    }
    this.syncGcodeObjTo=function (layerZ,lineNumber=Infinity)
    {
        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                if (child.userData.layerZ<layerZ) {
                    child.visible = true;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;                    

                    child.geometry.maxInstancedCount=child.userData.numLines;
                }else if (child.userData.layerZ==layerZ) {
                    child.visible = true;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    child.geometry.maxInstancedCount=Math.min(lineNumber,child.userData.numLines);
                }
                else {
                    child.visible = false;
                }
            }
        });
    }
    this.syncGcodeObjToFilePos=function (filePosition)
    {
        let syncLayerNumber = 0;//derived layer number based on pos and user data.
        gcodeGroup.traverse(function (child) {
            if (child.name.startsWith("layer#")) {
                var filePositions=child.userData.filePositions;
                var fpMin=filePositions[0];
                var fpMax = filePositions[filePositions.length-1];
                if (fpMax<filePosition) { //way before.
                    child.visible = true;

                   //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    if(child.geometry.type!="BufferGeometry")
                        child.geometry.maxInstancedCount=child.userData.numLines;
                    else
                        child.geometry.setDrawRange(0,child.userData.numLines*2)//*2 for plain lines
                }else if (fpMin>filePosition) { //way after
                    child.visible = false;
                }else //must be during. right?
                {
                    child.visible = true;

                    //handle hiding travels.
                    if(!window.PGCSettings.showTravel && child.userData.isTravel)
                        child.visible=false;

                    //count number of lines before filePos
                    var count =0;
                    while(count<filePositions.length && filePositions[count]<=filePosition)
                        count++;

                    if(child.geometry.type!="BufferGeometry")
                        child.geometry.maxInstancedCount=Math.min(count,child.userData.numLines);
                    else
                        child.geometry.setDrawRange(0,Math.min(count*2,child.userData.numLines*2));//*2 for plain lines
                    syncLayerNumber = child.userData.layerNumber
                }
            }
        });
        return syncLayerNumber;//used to sync other elements.
    }


    function addLayerObject(layer, extruding) {

        if (layer.vertex.length > 2) { //Something to draw?
            if(parserSettings.fatLines){//fancy lines
                var geo = new THREE.LineGeometry();
                geo.setPositions(layer.vertex);
                geo.setColors(layer.colors)
                var line = new THREE.Line2(geo, curMaterial);
                line.name = 'layer#' + layers.length;
                line.userData={layerZ:layer.z,layerNumber:layers.length,numLines:layer.vertex.length/6,filePositions:layer.filePositions};// 6 because 2 x triplets
                gcodeGroup.add(line);
                //line.renderOrder = 2;
            }else{//plain lines
                var geo = new THREE.BufferGeometry();
                geo.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(layer.vertex), 3 ) );
                geo.addAttribute( 'color', new THREE.BufferAttribute( new Float32Array(layer.colors), 3 ) );
                var line = new THREE.LineSegments( geo, curLineBasicMaterial );
                line.name = 'layer#' + layers.length;
                line.userData={layerZ:layer.z,layerNumber:layers.length,numLines:layer.vertex.length/6,filePositions:layer.filePositions};
                gcodeGroup.add(line);

            }
        }
        if (layer.pathVertex.length > 2) { //Something to draw?
            if(false){//fancy lines
                var geo = new THREE.LineGeometry();
                geo.setPositions(layer.pathVertex);
                geo.setColors(layer.pathColors)
                var line = new THREE.Line2(geo, curMaterial);
                line.name = 'layer#' + layers.length;
                line.userData={isTravel:true,layerZ:layer.z,layerNumber:layers.length,numLines:layer.pathVertex.length/6,filePositions:layer.pathFilePositions};// 6 because 2 x triplets
                gcodeGroup.add(line);
                //line.renderOrder = 2;
            }else{//plain lines
                var geo = new THREE.BufferGeometry();
                geo.addAttribute( 'position', new THREE.BufferAttribute( new Float32Array(layer.pathVertex), 3 ) );
                geo.addAttribute( 'color', new THREE.BufferAttribute( new Float32Array(layer.pathColors), 3 ) );
                var pathObj = new THREE.LineSegments( geo, curLineBasicMaterial );
                pathObj.name = 'layer#' + layers.length;
                pathObj.userData={isTravel:true,layerZ:layer.z,layerNumber:layers.length,numLines:layer.pathVertex.length/6,filePositions:layer.pathFilePositions};
                gcodeGroup.add(pathObj);

            }
        }

    }

    function newLayer(line) {
        if (currentLayer !== undefined) {
            addLayerObject(currentLayer);
        }

        currentLayer = { vertex: [], z: line.z, colors: [], filePositions:[],pathVertex: [],pathColors: [],pathFilePositions: [], };
        layers.push(currentLayer);
        //console.log("layer #" + layers.length + " z:" + line.z);

    }
    this.finishLayer= function(p) {
        if (currentLayer !== undefined) {
            addLayerObject(currentLayer);
        }

    }

    this.addTravel= function(p1, p2,color,filePos) {
        //check for new layer
        if (currentLayer === undefined || p1.z != currentLayer.z) {
            newLayer(p1);
        }

        //todo. does this happen?
        if(Number.isNaN(p1.x) ||Number.isNaN(p1.y) ||Number.isNaN(p1.z) ||Number.isNaN(p2.x) ||Number.isNaN(p2.y) ||Number.isNaN(p2.z))
        {
            console.log(["Bad line segment",p1,p2]);
            return;
        }

        currentLayer.pathVertex.push(p1.x, p1.y, p1.z);
        currentLayer.pathVertex.push(p2.x, p2.y, p2.z);
        currentLayer.pathFilePositions.push(filePos);//save for syncing.

        if (false)//faux shading. Darken line color based on angle
        {
            var per=1.0;//bright
            //var np2=new THREE.Vector3(p2.x,p2.y,p2.z);
            var vec = new THREE.Vector3(p2.x-p1.x,p2.y-p1.y,p2.z-p1.z);
            vec.normalize();
            per = (vec.dot(new THREE.Vector3(1,0,0))/2)+0.5;
            per=(per/5.0);

            var drawColor = new THREE.Color(color)
            var hsl = {}
            drawColor.getHSL(hsl);

            //darken every other line to make the layers easier to see.
            if((layers.length%2)==0)
                hsl.l = per+0.25;
            else
                hsl.l = per+0.30;

            drawColor.setHSL(hsl.h,hsl.s,hsl.l);
            //console.log(drawColor.r + " " + drawColor.g + " " + drawColor.b )
            currentLayer.pathColors.push(drawColor.r, drawColor.g, drawColor.b);
            currentLayer.pathColors.push(drawColor.r, drawColor.g, drawColor.b);

        }
        else {
            currentLayer.pathColors.push(color.r, color.g, color.b);
            currentLayer.pathColors.push(color.r, color.g, color.b);
        }
    }
    this.addSegment= function(p1, p2,color,filePos) {
        //check for new layer
        if (currentLayer === undefined || p1.z != currentLayer.z) {
            newLayer(p1);
        }

        //todo. does this happen?
        if(Number.isNaN(p1.x) ||Number.isNaN(p1.y) ||Number.isNaN(p1.z) ||Number.isNaN(p2.x) ||Number.isNaN(p2.y) ||Number.isNaN(p2.z))
        {
            console.log(["Bad line segment",p1,p2]);
            return;
        }

        currentLayer.vertex.push(p1.x, p1.y, p1.z);
        currentLayer.vertex.push(p2.x, p2.y, p2.z);
        currentLayer.filePositions.push(filePos);//save for syncing.

        if (true)//faux shading. Darken line color based on angle
        {
            var per=1.0;//bright
            //var np2=new THREE.Vector3(p2.x,p2.y,p2.z);
            var vec = new THREE.Vector3(p2.x-p1.x,p2.y-p1.y,p2.z-p1.z);
            vec.normalize();
            per = (vec.dot(new THREE.Vector3(1,0,0))/2)+0.5;
            per=(per/5.0);

            var drawColor = new THREE.Color(color)
            var hsl = {}
            drawColor.getHSL(hsl);

            //darken every other line to make the layers easier to see.
            if((layers.length%2)==0)
                hsl.l = per+0.25;
            else
                hsl.l = per+0.30;

            drawColor.setHSL(hsl.h,hsl.s,hsl.l);
            //console.log(drawColor.r + " " + drawColor.g + " " + drawColor.b )
            currentLayer.colors.push(drawColor.r, drawColor.g, drawColor.b);
            currentLayer.colors.push(drawColor.r, drawColor.g, drawColor.b);

        }
        else {
            currentLayer.colors.push(curColor.r, curColor.g, curColor.b);
            currentLayer.colors.push(curColor.r, curColor.g, curColor.b);
        }
    }

};

        //used to animate the nozzle position in response to terminal messages
function PrintHeadSimulator()
{
    var buffer=[];
    var HeadState = function(){
        this.position=new THREE.Vector3(0,0,0);
        this.rate=5.0*60;
        this.extrude=false;
        this.relative=false;
        //this.lastExtrudedZ=0;//used to better calc layer number
        this.layerLineNumber=0;
        this.clone=function(){
            var newState=new HeadState();
            newState.position.copy(this.position);
            newState.rate=this.rate;
            newState.extrude=this.extrude;
            newState.relative=this.relative;
            //newState.lastExtrudedZ=this.lastExtrudedZ;
            newState.layerLineNumber=this.layerLineNumber;
            newState.filePos=this.filePos;
            return(newState);
        }
    };
    var curState = new HeadState();
    var curEnd = new HeadState();
    var parserCurState = new HeadState();

    var observedLayerCount=0;
    var parserLayerLineNumber=0;
    var parserLastExtrudedZ=0;

    var curLastExtrudedZ=0;

    parserCurState.extrude=true;
    
    var previousPiece="";
    var filePos=0;
    var currentColor=new THREE.Color('white');
    var travelColor=new THREE.Color('white');

    var gcodeObject = new GCodeObject3()

    this.getCurPosition=function(){
        let startPoint=undefined
        if(bufferCursor>0)
            startPoint=buffer[bufferCursor-1].position

        return({position:curState.position,layerZ:curLastExtrudedZ,lineNumber:curState.layerLineNumber,filePos:curState.filePos,startPoint:startPoint,extrude:curState.extrude});
    }

    this.setCurPosition=function(filePos){

        let newBufferCursor=0;
        while(newBufferCursor<buffer.length)
        {
            if(buffer[newBufferCursor].filePos>filePos)
            {    
                console.log("buffer seek to:"+newBufferCursor)
                bufferCursor=newBufferCursor;
                curState=buffer[bufferCursor].clone()
                curEnd=buffer[bufferCursor].clone();
                return;
            }
            newBufferCursor++;
        }

    }


    
    this.getDeltaFromTo=function(startFilePos,filePos){

        if(filePos==startFilePos)
        {
            return {seconds:0,lines:0,distance:0};
        }
        if(filePos<startFilePos)
        {
            console.log("warning getDeltaFromTo wrong order"+[startFilePos,filePos])
            
            //swap
            let tt=filePos
            filePos=startFilePos
            startFilePos=tt;
            //return [0,0]
        }
        let startBufferCursor=0;
        while(startBufferCursor<buffer.length)
        {
            if(buffer[startBufferCursor].filePos>=startFilePos)
            {    
                //console.log("Found startBufferCursor:"+startBufferCursor)
                break;
            }
            startBufferCursor++;
        }

        let newBufferCursor=startBufferCursor;
       
        let count=0;
        let distTotal=0.0;
        let et=0.0;
        let curPos = buffer[newBufferCursor].position.clone();
        while(newBufferCursor<buffer.length)
        {
            if(buffer[newBufferCursor].filePos>=filePos)
            {    
                //console.log("Found endBufferCursor:"+newBufferCursor)
                return {seconds:et,lines:count,distance:/*Math.sqrt*/(distTotal)};
            }
            let dist=curPos.distanceTo(buffer[newBufferCursor].position)
            distTotal+=dist

            //dist is MM? rate is MM/Minute
            et+=(dist*(buffer[newBufferCursor].rate/60.0))/1000.0

            curPos = buffer[newBufferCursor].position.clone()
            newBufferCursor++;
            count++;

        }
        console.log("error getDeltaFromTo fell through"+[startFilePos,filePos])
        return [0,0]
    }

    this.getDeltaTo=function(filePos){

        if(bufferCursor>=buffer.length)
        {
            return {seconds:0,lines:0,distance:0};
        }

        if(buffer[bufferCursor].filePos>filePos)
        {
            //console.log("Overflow??")
            //console.log([buffer[bufferCursor].filePos,filePos])
        }
        let newBufferCursor=bufferCursor;
//newBufferCursor=0;        
        let count=0;
        let distTotal=0.0;
        let et=0.0;
        let curPos = buffer[newBufferCursor].position.clone();
        while(newBufferCursor<buffer.length)
        {
            if(buffer[newBufferCursor].filePos>=filePos)
            {    
                //console.log("getDeltaTo:"+[buffer[newBufferCursor].filePos,filePos])
                //return [et,count,Math.sqrt(distSq)];
                return {seconds:et,lines:count,distance:/*Math.sqrt*/(distTotal)};

            }
            let dist=curPos.distanceTo(buffer[newBufferCursor].position)
            distTotal+=dist
            //dist is MM? rate is MM/Minute
            et+=(dist*(buffer[newBufferCursor].rate/60.0))/1000.0

            curPos = buffer[newBufferCursor].position.clone()
            newBufferCursor++;
            count++;

        }
        return {seconds:0,lines:0,distance:0};
    }

    //load from a file://
    this.loadGcodeLocal=function(file){
        let reader = new FileReader();
        reader.onload = function(e) {
          //console.log(e.target.result);
          addCommands(e.target.result);
        };
        reader.readAsText(file, "UTF-8");
    }

    function finishLoading()
    {

        if (gcodeObject)
            gcodeObject.finishLayer();

        console.log("Finished loading GCode object.")
        console.log(["layers:",gcodeObject.getLayerCount(),"size:",filePos])

        // let totalLines=0;
        // for(let layer of layers)
        // {
        //     totalLines+=layer.vertex.length/6;
        // }
        // console.log(["lines:",totalLines])

        //this.syncGcodeObjTo(Infinity);

    }

    //load from a url
    this.loadGcode=function(file_url,apiKey)
    {
        //todo. Find a better way to pass the apiKey
        if(!apiKey)
            apiKey=''

        var myRequest = new Request(file_url,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'text/plain',
                    "X-Api-Key": apiKey
                },
                mode: 'cors',
                cache: 'no-cache'
            }
        );
        fetch(myRequest)
            .then(function (response) {
                var contentLength = response.headers.get('Content-Length');
                if (!response.body || !window['TextDecoder']) {
                    response.text().then(function (text) {
                        addCommands(text);
                        finishLoading();
                    });
                } else {
                    var myReader = response.body.getReader();
                    var decoder = new TextDecoder();
                    //var buffer = '';
                    var received = 0;
                    myReader.read().then(function processResult(result) {
                        if (result.done) {
                            finishLoading();
                            //syncGcodeObjTo(Infinity);
                            //console.log("PrintSimBufferSize:"+buffer.length)
                            return;
                        }
                        received += result.value.length;

                        /* process the buffer string */
                        addCommands(decoder.decode(result.value, { stream: true }));

                        // read the next piece of the stream and process the result
                        return myReader.read().then(processResult);
                    })
                }
            })

    }

    function getGcodeObject()
    {
        return gcodeObject;
    }
    this.getGcodeObject=getGcodeObject;

    function addObjectSegment(prevState,curState,filePos){
        //console.log("Parsed NewLine:")

        let p1=prevState.position;
        let p2=curState.position;
        let extruding = curState.extrude;

        if(extruding)
            gcodeObject.addSegment(p1,p2,currentColor,filePos)
        else
            gcodeObject.addTravel(p1,p2,travelColor,filePos)

    }
    function commentToColor(line)
    {
        let color=null;
        let cmdLower=line.toLowerCase();
        // if(cmdLower.startsWith("; object:{"))
        // {
        //     let json=line.substring("; object:".length);
        //     let slicerInfo=JSON.parse(json)
        //     console.log("Slicer Bound Center:"+slicerInfo.boundingbox_center)
        //     console.log("Slicer Bound Size:"+slicerInfo.boundingbox_size)
        // }
        // else if(cmdLower.startsWith(";min"))
        // {
        //     if(cmdLower.startsWith(";minx:"))
        //         console.log("MINX:"+parseInt(cmdLower.split(':')[1]))
        //     if(cmdLower.startsWith(";miny:"))
        //         console.log("MINY:"+parseInt(cmdLower.split(':')[1]))
        //     if(cmdLower.startsWith(";minz:"))
        //         console.log("MINZ:"+parseInt(cmdLower.split(':')[1]))
        // }
        // else if(cmdLower.startsWith(";max"))
        // {
        //     if(cmdLower.startsWith(";maxx:"))
        //         console.log("MAXX:"+parseInt(cmdLower.split(':')[1]))
        //     if(cmdLower.startsWith(";maxy:"))
        //         console.log("MAXY:"+parseInt(cmdLower.split(':')[1]))
        //     if(cmdLower.startsWith(";maxz:"))
        //         console.log("MAXZ:"+parseInt(cmdLower.split(':')[1]))
        // }
        // else 
        if (cmdLower.indexOf("inner") > -1) {
            color = new THREE.Color('forestgreen');//green
        }
        // else if (cmdLower.indexOf("overhang") > -1) {
        //     color = new THREE.Color('forestgreen');//green
        // }
        else if (cmdLower.indexOf("outer") > -1) {
            color = new THREE.Color('indianred');
        }
        else if (cmdLower.indexOf("perimeter") > -1) {
            color = new THREE.Color('indianred');
        }
        // else if (cmdLower.indexOf("gap fill") > -1) {
        //     color = new THREE.Color('skyblue');
        // }
        else if (cmdLower.indexOf("fill") > -1) {
            color = new THREE.Color('darkorange');
        }
        else if (cmdLower.indexOf("skin") > -1) {
            color = new THREE.Color('yellow');
        }
        // else if (cmdLower.indexOf("internal") > -1) {
        //     color = new THREE.Color('yellow');
        // }
        else if (cmdLower.indexOf("support") > -1) {
            color = new THREE.Color('skyblue');
        }
        else if (cmdLower.indexOf("skirt") > -1) {
            color = new THREE.Color('skyblue');
        }
        else
        {
            //cura info
            //;FLAVOR:Marlin
            //;TIME:1271
            //;Filament used: 1.2109m
            //;Layer height: 0.2

            //;LAYER_COUNT:98
            //;LAYER:0
            //;TIME_ELAPSED:195.644520
            //;LAYER:9

            //console.log("Comment:"+cmdLower)
            //var curColorHex = (Math.abs(cmd.hashCode()) & 0xffffff);
            //curColor = new THREE.Color(curColorHex);
            //console.log(cmd + ' ' + curColorHex.toString(16))
        }
        return color;
    }

    //add gcode commands to the buffer
    addCommands= function(chunk){
        //split chunk into lines
        var lines = chunk.split('\n');

        //handle partial lines from previous chunk.
        lines[0] = previousPiece + lines[0];
        previousPiece = lines[lines.length - 1];

        //note -1 so we dont process last line in case it is a partial.
        //Todo process the last line. Probably not needed since last line is usually gcode cleanup and not extruded lines.
        for (var i = 0; i < lines.length - 1; i++) {

            filePos+=lines[i].length+1;//+1 because of split \n. 
            
            //Process lines with comments
            if (lines[i].indexOf(";")>-1) {

                //send comment to handler
                //this.onComment(lines[i],filePos)
                var newColor = commentToColor(lines[i])
                if(newColor!=null && newColor!=currentColor)
                    currentColor=newColor;
            }

            //remove comments and process command part of line.
            var cmd = lines[i].replace(/;.+/g, '').toUpperCase();
            this.addCommand(cmd,filePos);
        }
    }
    //add gcode command to the buffer
    addCommand= function(cmd,filePos)
    {
        var is_g0_g1 = cmd.indexOf("G0 ")>-1 || cmd.indexOf("G1 ")>-1;
        var is_g2_g3 = !is_g0_g1 && cmd.indexOf("G2 ")>-1 || cmd.indexOf("G3 ")>-1;
        if(is_g0_g1 || is_g2_g3)
        {
            var parserPreviousState = {};
            // If this is a g2/g3, we need to know the previous state to interpolate the arcs
            if (is_g2_g3) { parserPreviousState = Object.assign(parserPreviousState, parserCurState);}
            // Extract x, y, z, f and e
            var x= parseFloat(cmd.split("X")[1])
            if(!Number.isNaN(x))
            {
                if(parserCurState.relative)
                    parserCurState.position.x+=x;
                else
                    parserCurState.position.x=x;
            }
            var y= parseFloat(cmd.split("Y")[1])
            if(!Number.isNaN(y))
            {
                if(parserCurState.relative)
                    parserCurState.position.y+=y;
                else
                    parserCurState.position.y=y;
            }
            var z= parseFloat(cmd.split("Z")[1])
            if(!Number.isNaN(z))
            {
                if(parserCurState.relative)
                    parserCurState.position.z+=z;
                else
                    parserCurState.position.z=z;
            }
            var f= parseFloat(cmd.split("F")[1])
            if(!Number.isNaN(f))
            {
                parserCurState.rate=f;
            }
            var e= parseFloat(cmd.split("E")[1])
            if(!Number.isNaN(e))
            {
                parserCurState.extrude=true;
                if( parserLastExtrudedZ!=parserCurState.position.z)
                {
                    //new layer (probably)
                    //observedLayerCount++
                    //console.log("New layer Z."+parserCurState.position.z+" File offset:"+currentFileOffset)
                    parserLayerLineNumber=0;
                    parserLastExtrudedZ=parserCurState.position.z;
                }
                else
                    parserLayerLineNumber++;
            }else{
                parserCurState.extrude=false;
            }
            parserCurState.layerLineNumber =parserLayerLineNumber;

            // if this is a g0/g1, push the state to the buffer
            if (is_g0_g1) {

                if(buffer.length>1){
                    let prevState=buffer[buffer.length-1];
                    addObjectSegment(prevState,parserCurState,filePos);
                }
                parserCurState.filePos=filePos;
                buffer.push(parserCurState.clone());
            }
            else{
                // This is a g2/g3, so we need to do things a bit differently.
                // Extract I and J, R, and is_clockwise
                var is_clockwise = cmd.indexOf(" G2")>-1;
                var i = parseFloat(cmd.split("I")[1]);
                var j = parseFloat(cmd.split("J")[1]);
                var r = parseFloat(cmd.split("R")[1]);
                var arc = {
                    // Get X Y and Z from the previous state if it is not
                    // provided
                    x: this.getCurrentCoordinate(x, parserPreviousState.position.x),
                    y: this.getCurrentCoordinate(y, parserPreviousState.position.y),
                    z: this.getCurrentCoordinate(z, parserPreviousState.position.z),
                    // Set I and J and R to 0 if they are not provided.
                    i: this.getCurrentCoordinate(i, 0),
                    j: this.getCurrentCoordinate(j, 0),
                    r: this.getCurrentCoordinate(r, 0),
                    // K omitted, not sure what that's supposed to do
                    //k: k !== undefined ? k : 0,
                    // Since the amount extruded doesn't really matter, set it to 1 if we are extruding,
                    // We don't want undefined values going into the arc interpolation routine
                    e: this.getCurrentCoordinate(e, parserPreviousState.extrude ? 1 : 0),
                    f: this.getCurrentCoordinate(r, parserPreviousState.rate),
                    is_clockwise: is_clockwise
                };
                // Need to handle R maybe
                var segments = self.interpolateArc(parserPreviousState, arc);
                for(var index = 1; index < segments.length; index++)
                {
                    var cur_segment = segments[index];

                    parserCurState.filePos=filePos;

                    var cur_state = parserCurState.clone();
                    cur_state.position = new THREE.Vector3(cur_segment.x,cur_segment.y,cur_segment.z);

                    //add segment to gcodeobject
                    if(buffer.length>1){
                        let prevState=buffer[buffer.length-1];
                        addObjectSegment(prevState,cur_state,filePos);
                    }


                    buffer.push(cur_state);
                }
            }
        } else if (cmd.indexOf(" G90")>-1) {
            //G90: Set to Absolute Positioning
            parserCurState.relative = false;
        } else if (cmd.indexOf(" G91")>-1) {
            //G91: Set to state.relative Positioning
            parserCurState.relative = true;
        } else if (cmd.indexOf(" G92")>-1) {
            //todo. Handle this?
            //G92: ?
            console.log("WARN:Unhandled G92")
            //parserCurState.relative = true;
        }                
    }

    // Handle undefined and NaN for current coordinates.
    this.getCurrentCoordinate=function(cmdCoord, prevCoord) {
        if (cmdCoord === undefined || isNaN(cmdCoord)){
            cmdCoord=prevCoord;
        }
        return cmdCoord;
    }
    getCurrentCoordinate=this.getCurrentCoordinate;
    //Update the printhead position based on time elapsed.
    var bufferCursor=0;
    function updatePosition(timeStep){
        if(bufferCursor>=buffer.length)
            return;//at end of buffer nothing to do  

        //Convert the gcode feed rate (in MM/per min?) to rate per second.
        var rate = curState.rate/60.0;
    
//rate=rate*0.75;//why still too fast?        
//        rate=rate*10

        //adapt rate to keep up with buffer.
        //todo. Make dist based rather than just buffer size.
        if(buffer.length>10)
        {
//                    rate=rate*(buffer.length/5.0);
            //console.log(["Too Slow ",rate,buffer.length])
        }
        if(buffer.length<5)
        {
//                    rate=rate*(1.0/(buffer.length*5.0));
            //console.log(["Too fast ",rate,buffer.length])
        }

        //dist head needs to travel this frame
        var dist = rate*timeStep
        while(bufferCursor<buffer.length && dist >0)//while some place to go and some dist left.
        {
            //direction
            var vectToCurEnd=curEnd.position.clone().sub(curState.position);
            var distToEnd=vectToCurEnd.length();
            if(dist<distToEnd)//Inside current line?
            {
                //move pos the distance along line
                vectToCurEnd.setLength(dist);
                curState.position.add(vectToCurEnd);  
                dist=0;//all done 
            }else{
                //move pos to end point.
                curState.position.copy(curEnd.position);
                curState.rate=curEnd.rate;
                curState.filePos=curEnd.filePos;

                //subract dist for next loop.
                dist=dist-distToEnd;

                //update lastZ for display of layers. 
                if(curEnd.extrude && curEnd.position.z != curLastExtrudedZ )
                {
                    curLastExtrudedZ=curEnd.position.z;
                }
                //console.log([curState.position.z,curState.layerLineNumber])

                //start on next buffer command
                //buffer.shift();
                if(bufferCursor< buffer.length-1)
                {
                    bufferCursor+=1;
                    curEnd=buffer[bufferCursor];
                    curState.layerLineNumber=curEnd.layerLineNumber;

                    curState.rate=curEnd.rate;
                    curState.extrude=curEnd.extrude;

                }else
                    return;//at end of buffer
            }
        }
    }

    this.updatePosition=updatePosition;

    function updatePosition2(timeStep,playbackRate,linesBehind,maxFilePos){
        if(bufferCursor>=buffer.length)
            return;//at end of buffer nothing to do  

        //Convert the gcode feed rate (in MM/per min?) to rate per second.
        var rate = curState.rate/60.0;
    
rate=rate*0.090;//why still too fast?        
//        rate=rate*10

        //adapt rate to keep up with buffer.
        //todo. Make dist based rather than just buffer size.
        if(linesBehind<1)
            return;
        if(linesBehind>5)
        {
            rate=rate*(linesBehind/0.9);
            //console.log(["Too Slow ",rate,linesBehind])
        }
        if(linesBehind<2)
        {
            rate=rate*(1.0/(linesBehind*5.0));
            //console.log(["Too fast ",rate,linesBehind])
        }
     
        //dist head needs to travel this frame
        //todo. this is wrong. dist is based on rate of this segment only. 
        //dist may not be the way to do this now.
        //instead reduce a time by rate*distance
        var dist = rate*timeStep
        while((bufferCursor<buffer.length) && (dist >0))//while some place to go and some dist left.
        {
            //direction
            var vectToCurEnd=curEnd.position.clone().sub(curState.position);
            var distToEnd=vectToCurEnd.length();
            if(dist<distToEnd)//Inside current line?
            {
                //move pos the distance along line
                vectToCurEnd.setLength(dist);
                curState.position.add(vectToCurEnd);  
                dist=0;//all done 
            }else{
                //move pos to end point.
                curState.position.copy(curEnd.position);
                curState.rate=curEnd.rate;
                curState.filePos=curEnd.filePos;

                //subract dist for next loop.
                dist=dist-distToEnd;

                //update lastZ for display of layers. 
                if(curEnd.extrude && curEnd.position.z != curLastExtrudedZ )
                {
                    curLastExtrudedZ=curEnd.position.z;
                }
                //console.log([curState.position.z,curState.layerLineNumber])

                //start on next buffer command
                //buffer.shift();
                if(bufferCursor< buffer.length-1)
                {
                    //Done if next would go past the maxFilePos
                    if( buffer[bufferCursor+1].filePos>=maxFilePos)
                    {
                        //console.log("early")
                        //console.log([buffer[bufferCursor].filePos,maxFilePos])                
                        break;
                    }
                    bufferCursor+=1;
                    curEnd=buffer[bufferCursor];
                    curState.layerLineNumber=curEnd.layerLineNumber;

                    curState.rate=curEnd.rate;
                    curState.extrude=curEnd.extrude;

                }else
                    return;//at end of buffer
            }
        }
    }
    this.updatePosition2=updatePosition2;

}

