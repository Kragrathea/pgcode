# DEV VERSION

# PrettyGCode for Klipper
PrettyGCode WebGL based GCode preview and simulator

# Features
- 3D WebGL preview of GCode 
- Tested with desktop Chrome, Firefox, Edge and Safari. Works on mobile browsers if the GCode isn't too large.
- Sync to Klipper/Moonraker/Fluidd print jobs in real time
- Compatible with OBS Studio browser for easy Streaming (requires command line flag)
- Drag drop GCode files to 3d window for quick preview

# Screenshots
![Screen1](https://raw.githubusercontent.com/Kragrathea/pgcode/main/img/pgc_screen1.jpg)

# Installation via Kiauh (Recommended)
PrettyGCode can now be installed using the Kiauh installer. This is by far the easiest method to install.

https://github.com/th33xitus/kiauh

On the main screen select option 1) [Install] then select PrettGCode:


Port can be set as part of installation. Default port is 7136

# Connecting to Fluidd/Moonraker

Assuming you installed on a machine with a local name of "fluiddpi" you can access the PrettyGCode page by using this url. 

http://fluiddpi.local:7136 <-Should automatically connect to the local instance of Fluidd

If you installed to some other machine subsititute the ip address or name.

The above URL should take you to the PrettyGCode home page.  If Fluidd or Moonraker (or OctoPrint) is installed on the same machine code will attempt to detect the server type and should automatically connect. If your server is located on another machine or isn't being detected you can specifiy it on the command line like this:

http://fluiddpi.local:7136?server=http://fluiddpi.local:7125 <-Connect to the local instance of Moonraker (port 7125 by default)

or.

http://pgcode url:7136?server=http:// moonraker machine url:port

NOTE: For now URLS must be in the format http://servername:port without any trailing path info.


# Moonraker config
PrettyGCode should run as installed. But, depending on your setup, you may have to edit Moonraker.conf to allow access. Check that the machine you are browsing from is included in the cors_domains and/or trusted_clients sections. You may also have to turn on octoprint_compat

Partial moonraker.conf
```
[authorization]
enabled: True
cors_domains:
  *.local
  *.lan
  *://app.fluidd.xyz
  *

trusted_clients:
    10.0.0.0/8
    127.0.0.0/8
    169.254.0.0/16
    172.16.0.0/12
    192.168.0.0/16
    192.168.1.0/160
    FE80::/10
    ::1/128

# enables support for slicer uploads via partial Octoprint API impl
[octoprint_compat]
```
# Fluidd config
If you haven't already you may have to enable SD support in Fluidd

Partial Fluidd client.cfg
```
[virtual_sdcard]
path: ~/gcode_files
```

# Troubleshooting connections
For now to trouble shoot the connection you need to open the browsers developer console and look for warnings in the console.

You may have to enable [octoprint_compat] in moonraker.conf file. 



