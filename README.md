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

# Stand Alone Installation (not recommended)
- For stand alone install on a Raspberry PI you need to first install nginx. If you already have Fluidd installed this shouldn't be needed.
- Install nginx. Then skip to below

# Fluidd based install (recommended)
From now on these instructions are assuming you are using Fluidd as the UI for Klipper/Moonraker. Eventually PrettyGCode will support other frontends like OctoPrint, Mainsail, DWC etc. 
- First log into your Raspberry PI via telent or tty.
- Clone repo into /home/pi/
```
cd ~
git clone https://github.com/Kragrathea/pgcode.git
```

Config nginx server for a new website called "pgcode" on port 7136
- Copy the nginx config file from the pgcode directory to the nginx sites directory
```
sudo cp ~/pgcode/pgcode.local.conf /etc/nginx/sites-available/pgcode.local.conf
```
Nginx config file should look like this.
```
server {
     listen 7136;
     listen [::]:7136;
     server_name pgcode.local;

     root /home/pi/pgcode;

     index pgcode.html;

     location / {
          try_files $uri $uri/ =404;
     }
}
```
- Sanity check. This should display any config errors
```
sudo nginx -t -c /etc/nginx/nginx.conf
```

- Enable site by making symbolic link
```
sudo ln -s /etc/nginx/sites-available/pgcode.local.conf  /etc/nginx/sites-enabled/pgcode.local.conf
```

- Restart nginx
```
sudo systemctl reload nginx
```
- Default port is 7136. 

- You may have to enable [octoprint_compat] in moonraker.conf file. 

# Connecting to Fluidd/Moonraker

Assuming you installed on a machine with a local name of "fluiddpi" you can access the PrettyGCode page by using this url. 

http://fluiddpi.local:7136 <-Should automatically connect to the local instance of Fluidd

If you installed to some other machine subsititute the ip address or name.

The above URL should take you to the PrettyGCode home page.  If Fluidd or Moonraker (or OctoPrint) is installed on the same machine code will attempt to detect the server type and should automatically connect. If your server is located on another machine or isn't being detected you can specifiy it on the command line like this:

http://fluiddpi.local:7136?server=http://fluiddpi.local:7125 <-Connect to the local instance of Moonraker (port 7125 by default)

or.

http://pgcode url:7136?server=http:// moonraker machine url:port

NOTE: For now URLS must be in the format http://servername:port without any trailing path info.
# Troubleshooting connections
For now to trouble shoot the connection you need to open the browsers developer console and look for warnings in the console.

You may have to enable [octoprint_compat] in moonraker.conf file. 

