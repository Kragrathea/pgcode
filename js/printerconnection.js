function PrinterConnection()
{

    var printerConnection=this;
    window.printerConnection=this;
    var connectionLog=[]

    this.addLog=function(str){
        console.log(str)
        connectionLog.push(str)
    }
    this.getLog=function()
    {
        return connectionLog;
    }
    //var defaultPrinterUrl=
    //var defaultMoonrakerPort="7125"
    this.detectConnection=function(serverUrl,apiKey)
    {

        this.addLog("Detecting connection on:"+serverUrl)
        var myRequest = new Request(serverUrl+"/api/version",
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'text/plain',
                    "X-Api-Key": apiKey
                },
                mode: 'cors',
                cache: 'no-cache',
                //timeout: 2000 
            }
        );
        fetch(myRequest)
            .then(function (response) {
                var contentLength = response.headers.get('Content-Length');
                //console.log(response)
                if(!response.ok)
                {
                    this.addLog(response.status)
                    throw(response.status+":"+response.statusText)
                }
                if (!response.body || !window['TextDecoder']) {
                    response.text().then(function (text) {
                        //console.log("Detect FINISH:"+text);
                        //finishLoading();
                    });
                } else {
                    var myReader = response.body.getReader();
                    var decoder = new TextDecoder();
                    var buffer = '';
                    var received = 0;
                    myReader.read().then(function processResult(result) {
                        if (result.done) {
                            return;
                        }
                        received += result.value.length;
                        let rresult = decoder.decode(result.value, { stream: true });
                        let msg = JSON.parse(rresult);
                        
                        if(msg.error){
                            this.addLog("Detect ERROR:"+msg.error);
                        }
                        else{
                            if(msg.text && msg.text.toLowerCase().indexOf("moonraker")>-1){
                                printerConnection.addLog("Detected Moonraker on:"+serverUrl+" version:"+msg.text)
                                //printerConnection.addLog(msg.text)
                                printerConnection.connectToMoonraker(serverUrl,apiKey)
                            }else if(msg.text && msg.text.toLowerCase().indexOf("octoprint")>-1){
                                printerConnection.addLog("Detected Octoprint on:"+serverUrl+" version:"+msg.text)
                                //printerConnection.addLog(msg.text)
                                printerConnection.connectToOctoprint(serverUrl,apiKey)
                            }else{
                                printerConnection.addLog("Detect Error:Unknown server:"+msg.text)
                                
                            }
                        }
                        return myReader.read().then(processResult);
                    })
                }                                

            }).catch((error) => {
                this.addLog('AUTO Detect Error:', error);
                if(error.message=='Failed to fetch')
                {
                    printerConnection.addLog("AUTO Detect: Cant connect. Connection refused?")
                }
                if(error.message=='403:FORBIDDEN' || '401:Unauthorized')
                {
                    printerConnection.addLog("AUTO Detect: Cant connect. API Key bad or missing?")
                }else
                {
                    printerConnection.addLog("AUTO Detect: Unhandled error:"+error.message)
                }                
                printerConnection.addLog('Attempting direct Moonraker connection on:'+serverUrl);
                printerConnection.connectToMoonraker(serverUrl,apiKey)
            });            
    }

    var forceDisconnect=false;//not used?
    var connectionError=false;
    var currentServerUrl=''
    var currentApiKey=''
    this.getConnectionInfo=function()
    {
        return{server:currentServerUrl,apiKey:currentApiKey}
    }
    this.connectToOctoprint=function(serverUrl,apiKey)
    {

        currentServerUrl=serverUrl;
        currentApiKey=apiKey;

        let host=serverUrl;

        setInterval(function () {

            if(forceDisconnect)
                return;

                //todo. put this somewhere else
            $("#status-source").html("Octoprint")

            var file_url = host+"/api/job";//'/downloads/files/local/xxx.gcode';
            //var file_url = "/api/job";//'/downloads/files/local/xxx.gcode';

            var myRequest = new Request(file_url,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'text/plain',
                        "X-Api-Key": apiKey
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    timeout: 900 
                }
            );
            fetch(myRequest)
                .then(function (response) {
                    var contentLength = response.headers.get('Content-Length');
                    //console.log(response)
                    if (!response.body || !window['TextDecoder']) {
                        response.text().then(function (text) {
                            //console.log("FINISH:"+text);
                            //finishLoading();
                        });
                    } else {
                        var myReader = response.body.getReader();
                        var decoder = new TextDecoder();
                        var buffer = '';
                        var received = 0;
                        myReader.read().then(function processResult(result) {
                            if (result.done) {
                                return;
                            }
                            received += result.value.length;
                            let rresult = decoder.decode(result.value, { stream: true });
                            let msg = JSON.parse(rresult);
                            if(msg.progress){
                                let perDone = parseInt(msg.progress.completion);
                                if(isNaN(perDone))
                                    perDone=0;
                                printerConnection.curPrinterState.perDone=perDone;
                                printerConnection.curPrinterState.printTime=msg.progress.printTime;
                                printerConnection.curPrinterState.printTimeLeft=msg.progress.printTimeLeft
                            }
                            if(msg.state){
                                //console.log(msg.progress.filepos)
                                //todo. Find a more robust way to track connection status
                                printerConnection.curPrinterState.connected=true;

                                printerConnection.curPrinterState.filePos=msg.progress.filepos
                                printerConnection.curPrinterState.state=msg.state.toLowerCase();
                            }                                
                            if(msg.job){
                                //console.log(msg.job.file.path)
                                if(msg.job.file.path){
                                    printerConnection.curPrinterState.gcodeName=msg.job.file.path
                                    printerConnection.curPrinterState.gcodePath=host+'/downloads/files/local/'+msg.job.file.path+"?apikey="+apiKey
                                }
                            }

                            printerConnection.onUpdateState(printerConnection.curPrinterState);

                            // read the next piece of the stream and process the result
                            return myReader.read().then(processResult);
                        })
                    }                                

                })

        }, 1000);

        //get temp info.
        printerConnection.startTempUpdate(serverUrl,apiKey)
    }                

    var socketUrl=null

    this.curPrinterState={
        connected:false,
        state:"disconnected",
        gcodeName:"",
        gcodePath:"",
        filePos:0,
        perDone:0,
        printTime:0,
        printTimeLeft:0,
        bedTemp:0,
        toolTemp:0,        
    }
    this.getState=function()
    {
        return this.curPrinterState;
    }

    this.updateStateFromMoonraker=function()
    {
        //handle disconnect if dragdropped a file.
        //todo is this the right place to handle this?
        if(forceDisconnect)
            return;

        if(lastVirtualSD){
            let perDone = (lastVirtualSD.progress);
            if(isNaN(perDone))
                perDone=0;
            perDone=parseInt(perDone*100);
            this.curPrinterState.filePos=lastVirtualSD.file_position
            this.curPrinterState.perDone=perDone
        }
        if(lastPrintStats){
            let gcodePath=socketUrl.origin+'/server/files/gcodes/'+lastPrintStats.filename
            this.curPrinterState.state=lastPrintStats.state.toLowerCase()
            this.curPrinterState.gcodePath=gcodePath
            this.curPrinterState.gcodeName=lastPrintStats.filename
            this.curPrinterState.printTime=lastPrintStats.print_duration
            let totalPrintTime=(1.0/lastVirtualSD.progress)*(lastPrintStats.print_duration);
            this.curPrinterState.printTimeLeft=totalPrintTime-lastPrintStats.print_duration
            this.curPrinterState.bedTemp=lastBedTemp
            this.curPrinterState.toolTemp=lastExtruderTemp
        }
        //if(this.onUpdateState)
            this.onUpdateState(this.curPrinterState);
        //return(printerState)
    }
    function oldupdateStateFromMoonraker()
    {

        if(lastPrintStats){
            let jobName=lastPrintStats.filename
            if(jobName){
                updateJob(socketUrl.origin+'/server/files/gcodes/'+jobName);
                $("#status-name").html(jobName)
            }
            curPrinterState=lastPrintStats.state.toLowerCase();
            $("#status-state").html(curPrinterState)
            let ptime= lastPrintStats.total_duration
            $("#status-elapsed").html(new Date(ptime * 1000).toISOString().substr(11, 8))

        }
        if(lastVirtualSD){
            curPrintFilePos=lastVirtualSD.file_position
            let perDone = (lastVirtualSD.progress);
            if(isNaN(perDone))
                perDone=0;
            perDone=parseInt(perDone*100);
            $("#status-done").html(perDone.toString()+"%")
            if(gcodeProxy)
                $("#status-layer").html(currentCalculatedLayer.toString()+"/"+gcodeProxy.getLayerCount())
        }


        //from octoprint update
        $("#status-name").html(msg.job.file.path)
        $("#status-eta").html(new Date(msg.progress.printTimeLeft * 1000).toISOString().substr(11, 8))
        $("#status-done").html(perDone.toString()+"%")
        $("#status-elapsed").html(new Date(msg.progress.printTime * 1000).toISOString().substr(11, 8))
        if(gcodeProxy)
            $("#status-layer").html(currentCalculatedLayer.toString()+"/"+gcodeProxy.getLayerCount())

        curPrintFilePos=msg.progress.filepos
        $("#status-state").html(msg.state)
        curPrinterState=msg.state.toLowerCase();

        //    updateJob(host+'/downloads/files/local/'+msg.job.file.path+apiKey);

        $("#status-source").html("OctoPrint")
        //console.log("Set curPrinterState:"+curPrinterState)

    }

    var lastPrintStats=null;
    var lastVirtualSD=null;
    var lastExtruderTemp=0;
    var lastBedTemp=0;

    this.moonrakerLogin=function(host){

    return new Promise(function(resolve, reject) {    
            let searchParams = new URLSearchParams(window.location.search)    
            if(searchParams.has('user') && searchParams.has('pass'))
            {
                const formData = new FormData();
        
                formData.append('username', searchParams.get("user"));
                formData.append('password', searchParams.get("pass"));
        
                var loginRequest = new Request(host+"/access/login",
                    {
                        method: 'POST',
                        body: formData
                    }
                    );
                fetch(loginRequest)
                    .then(function (response) {
                        var contentLength = response.headers.get('Content-Length');
                        //console.log(response)
                        if(!response.ok)
                            throw(status)
                        if (!response.body || !window['TextDecoder']) {
                            response.text().then(function (text) {
                            });
                        } else {
                            response.json().then(function(data) {
                                document.authToken = data.result.token;
                                resolve(data.result.token)
                            });
                        }
                });
        
            }
        })
    }

    this.getOneShotToken=function(host,apiKey)
    {
        return new Promise(function(resolve, reject) {


//todo. test getting a oneshot with a blank apikey

            //let searchParams = new URLSearchParams(window.location.search)
            //if(!apiKey)
            //    resolve("")//no apikey provided

            printerConnection.addLog("getOneShotToken from:"+host)
            //let apiKey=searchParams.get('apiKey')
            var myRequest = new Request(host+"/access/oneshot_token",
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'text/plain',
                        "X-Api-Key": apiKey
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    //timeout: 2000 
                }
            );
            fetch(myRequest)
                .then(function (response) {
                    var contentLength = response.headers.get('Content-Length');
                    //console.log(response)
                    if(!response.ok)
                    {
                        printerConnection.addLog(response.status)
                        throw(response.status+":"+response.statusText)
                    }
                    if (!response.body || !window['TextDecoder']) {
                        response.text().then(function (text) {
                        });
                    } else {
                        var myReader = response.body.getReader();
                        var decoder = new TextDecoder();
                        var buffer = '';
                        var received = 0;
                        myReader.read().then(function processResult(result) {
                            if (result.done) {
                                return;
                            }
                            received += result.value.length;
                            let rresult = decoder.decode(result.value, { stream: true });
                            let msg = JSON.parse(rresult);

                            document.oneShotToken=msg.result;
                            printerConnection.addLog("getOneShotToken success")
                            resolve(msg.result);

                            //return myReader.read().then(processResult);
                        })
                    }                                

                }).catch((error) => {
                    printerConnection.addLog('Error getOneShotToken:', error);
                    if(error.message=='Failed to fetch')
                    {
                        printerConnection.addLog("Connection refused")
                        printerConnection.connectionError=true; //this is a fatal connection error
                    }
                    if(error.message=='403:FORBIDDEN' || error.message=='401:Unauthorized')
                    {
                        printerConnection.addLog("Forbidden. API Key bad or missing?")
                        printerConnection.connectionError=true; //this is a fatal connection error
                    }  
                    reject();
                    //console.error('Attempting direct Moonraker connection on:', file_url);
                    //printerConnection.connectToMoonraker(file_url)
                }); 
        });
    }

    this.connectToMoonraker=function(serverUrl,apiKey)
    {
        //this.moonrakerLogin(serverUrl).then(result=>alert(result))
        currentServerUrl=serverUrl;


        currentApiKey=apiKey;

        this.getOneShotToken(serverUrl,apiKey).then(result=>{

            socketUrl=new URL(serverUrl);
            let socketHost=socketUrl.host;
            if ("WebSocket" in window)
            {
                let socketUrl = "ws://"+socketHost+"/websocket"+"?token="+result
                if(serverUrl.toLowerCase().startsWith("https"))
                    socketUrl = "wss://"+socketHost+"/websocket"+"?token="+result

                printerConnection.addLog("SocketURL:"+socketUrl)
                var ws = new WebSocket(socketUrl);
                ws.onopen = function()
                {
                    
                    printerConnection.addLog("Connected to Moonraker on:ws://"+socketHost)

                    printerConnection.curPrinterState.connected=true;

                    $("#status-source").html("Moonraker ")
    
                    //{"result": {"objects": ["webhooks", "configfile", "mcu", "gcode_move", "print_stats", "virtual_sdcard", "pause_resume", "display_status", 
                    //"gcode_macro CANCEL_PRINT", "gcode_macro PAUSE", "gcode_macro RESUME", "heaters", "heater_bed", "fan", "menu", "probe", "bed_mesh", 
                    //"query_endstops", "idle_timeout", "system_stats", "toolhead", "extruder"]}}
                    ws.send('{"jsonrpc": "2.0","method": "printer.objects.query","params": {"objects": {"print_stats": null,"virtual_sdcard": null}},"id": 5434}')
                    ws.send('{"jsonrpc": "2.0","method": "printer.objects.subscribe","params": {"objects": {'+
                                '"virtual_sdcard":null,'+
                                //'"virtual_sdcard":["file_position","progress"],'+
                                '"print_stats":null,'+
                                //'"print_stats":["filename","total_duration","state"],'+
                                '"extruder":null,'+
                                '"heater_bed":null'+
                                //'"toolhead": ["gcode_position"]'+
                            '}},"id": 5434}'
                            );
                    ws.send('{"jsonrpc": "2.0","method": "server.files.list","params": {},"id": 5434}')                            
                };
    
                ws.onmessage = function (e) 
                { 
                    handled=false;
                    if(e.data.indexOf("notify_proc_stat_update")>-1)
                        handled=true;
                    
                    let msg = JSON.parse(e.data);
    
                    if(msg.result)
                    { 
                        handled=true;
                        if(msg.result.status)
                        {
                            for(var sname in msg.result.status)
                            {
                                //console.log("StatusObject:"+JSON.stringify(msg.result))
    
                                if(sname=="print_stats"){
                                    lastPrintStats=msg.result.status["print_stats"]
                                }else if(sname=="virtual_sdcard")
                                {
                                    lastVirtualSD=msg.result.status["virtual_sdcard"]
                                }else if(sname=="extruder")
                                {
                                    lastExtruderTemp=msg.result.status["extruder"].temperature;
                                    $("#status-tooltemp").html(lastExtruderTemp.toFixed(1)+"&deg;")
                                }else if(sname=="heater_bed")
                                {
                                    lastBedTemp=msg.result.status[sname].temperature;
                                    $("#status-bedtemp").html(lastBedTemp.toFixed(1)+"&deg;")                                   
                                }else{
                                    console.log("Unhandled status update:"+sname)
                                    console.log("Result:"+JSON.stringify(msg.result))
                                }                                
                            }
                        }else{
                            //console.log("Result with no status:")

                            //handle reply to "server.files.list" here.
                            
                            //console.log("Result:"+JSON.stringify(msg.result))
                        }
                    }
                    if(msg.method)
                    { 
                        handled=true;
                        switch (msg.method)
                        {
                            case "notify_proc_stat_update"://moonraker stats
                                break;
                            case "notify_gcode_response":
                                break;
                            case "notify_filelist_changed":
                                //params:[{"action":"create_file","item":{"modified":1629359885.227688,"size":5071474,"path":"CCR10_blah.gcode","root":"gcodes"}}]

                                break;                                
                            case "notify_history_changed"://could be useful
                                /*
                                [{"action":"added",
                                "job":{"end_time":null,"filament_used":0,"filename":"CCR10_Nose106.gcode","metadata":{"size":2293492,"modified":1623478815.3715193,"slicer":"Cura","slicer_version":"4.9.1",
                                "layer_height":0.2,"first_layer_height":0.28,"object_height":19.68,"filament_total":1210.9,"estimated_time":1271,
                                "first_layer_bed_temp":50,"first_layer_extr_temp":200,"gcode_start_byte":184,"gcode_end_byte":2292465},"print_duration":0,
                                "status":"in_progress","start_time":1627624619.435916,"total_duration":0.20733989498694427,"job_id":"000039","exists":true}}]}
                                [{"action":"finished","job":{"end_time":1627624638.4906535,"filament_used":0,"filename":"CCR10_Nose106.gcode","metadata":{"size":2293492,"modified":1623478815.3715193,"slicer":"Cura","slicer_version":"4.9.1","layer_height":0.2,"first_layer_height":0.28,"object_height":19.68,"filament_total":1210.9,"estimated_time":1271,"first_layer_bed_temp":50,"first_layer_extr_temp":200,"gcode_start_byte":184,"gcode_end_byte":2292465},"print_duration":0,"status":"cancelled","start_time":1627624619.435916,"total_duration":19.01413353398675,"job_id":"000039","exists":true}}]}
                                */
                                //console.log("history:"+JSON.stringify(msg))
    
                                //force refresh of stats on history change
                                ws.send('{"jsonrpc": "2.0","method": "printer.objects.query","params": {"objects": {"print_stats": null,"virtual_sdcard": null}},"id": 5434}')
                                //ws.send('{"jsonrpc": "2.0","method": "server.files.list","params": {"root": "/","id": 5434}')
                                break;
                            case "notify_status_update":
                                //console.log("status_update:")
                                let keys=Object.keys(msg.params[0]);
                                for(let pnum=0;pnum<keys.length;pnum++){
                                    let pname=keys[pnum]
                                    if(pname=='print_stats'){
                                        //let pms=msg.params[pnum]
                                        let pobj = msg.params[0][pname]
    
                                        lastPrintStats=Object.assign(lastPrintStats,pobj)
                                        //console.log("PRINTSTATS:"+JSON.stringify(lastPrintStats))
                                    }else if(pname=='virtual_sdcard'){
                                        let pobj = msg.params[0][pname]
                                        lastVirtualSD=Object.assign(lastVirtualSD,pobj)
                                        //console.log("VIRTSD:"+JSON.stringify(lastVirtualSD))
                                    }else if(pname=="extruder")
                                    {
                                        let pobj = msg.params[0][pname]
                                        lastExtruderTemp=pobj.temperature;
                                        $("#status-tooltemp").html(lastExtruderTemp.toFixed(1)+"&deg;")
                                    }else if(pname=="heater_bed")
                                    {
                                        let pobj = msg.params[0][pname]
                                        lastBedTemp=pobj.temperature;
                                        $("#status-bedtemp").html(lastBedTemp.toFixed(1)+"&deg;")
                                    }else if(!pname){
                                        //this case is for the single floating value that is last in the array. event time I think
                                        //console.log("param:"+JSON.stringify(msg.params[pnum]))
                                    }else{
                                        console.log("Unhandled status_update pname:"+pname)
                                        console.log("param:"+JSON.stringify(msg.params[pnum]))
                                    }
    
                                }
                                break;
                            default:
                                console.log("Unhandled Method:"+msg.method)
                                console.log("params:"+JSON.stringify(msg.params))
                                break;
    
                        }
                        
                    }
                            
                    printerConnection.updateStateFromMoonraker();
                    if(!handled)
                        console.log("Unhandled Message:"+e.data)
    
                };
    
                ws.onclose = function()
                { 
                    printerConnection.addLog("Disconnected from printer")
                    printerConnection.connectionError=true; //this is a fatal connection error
                    if(this.curPrinterState)
                        this.curPrinterState.connected=false;
                    //alert("Disconnected from printer")

                };
    
                ws.onerror = function(error){
                    printerConnection.addLog("Error connecting wsock:"+error)
                    printerConnection.connectionError=true; //this is a fatal connection error
                    if(this.curPrinterState)
                        this.curPrinterState.connected=false;

                }
            }
    
            else
            {
            // The browser doesn't support WebSocket
            }
            //printerConnection.startTempUpdate(serverUrl,apiKey);
        })

            

    }
    this.startTempUpdate=function(serverUrl,apiKey='')
    {
                    //get temp info.
        setInterval(function () {

            if(forceDisconnect)
                return;

            var file_url = serverUrl+"/api/printer";//+apiKey;//'/downloads/files/local/xxx.gcode';
            //var file_url = "/api/job";//'/downloads/files/local/xxx.gcode';

            var myRequest = new Request(file_url,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'text/plain',
                        "X-Api-Key": apiKey
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    timeout: 900 
                }
            );
            fetch(myRequest)
                .then(function (response) {
                    var contentLength = response.headers.get('Content-Length');
                    //console.log(response)
                    if (!response.body || !window['TextDecoder']) {
                        response.text().then(function (text) {
                            console.log(text);
                            //finishLoading();
                        });
                    } else {
                        var myReader = response.body.getReader();
                        var decoder = new TextDecoder();
                        var buffer = '';
                        var received = 0;
                        myReader.read().then(function processResult(result) {
                            if (result.done) {
                                return;
                            }
                            received += result.value.length;
                            let rresult = decoder.decode(result.value, { stream: true });
                            let msg = JSON.parse(rresult);
                            if(msg.temperature){

                                $("#status-bedtemp").html(msg.temperature.bed.actual.toFixed(1)+"&deg;")
                                $("#status-tooltemp").html(msg.temperature.tool0.actual.toFixed(1)+"&deg;")
                            }
                            return myReader.read().then(processResult);
                        })
                    }                                

                })

        }, 1000);  
    }
}