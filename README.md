# pgcode
PrettyGCode WebGL based GCode preview and simulator

# Stand Alone Installation
- For stand alone install on a Raspberry PI you need to first install nginx. If you already have Fluidd installed this shouldn't be needed.
- Install nginx. Then skip to below

# Fluidd based install
From now on these instructions are assuming you are using Fluidd. Eventually PrettyGCode will support other frontends like OctoPrint, Mainsail, DWC etc. 
- Clone repo into /home/pi/
```
cd ~
git clone https://github.com/Kragrathea/pgcode.git
```

- Config nginx server for a new website called "pgcode" on port 7136
```
sudo nano /etc/nginx/sites-available/pgcode.local.conf
```
Paste this into the conf and save.
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

# Connecting to Fluidd/Moonraker

Assuming you installed on a machine with a local name of "fluiddpi" you can access the PrettyGCode page by using this url. If you installed to some other machine subsititute the ip address or name.
http://fluiddpi.local:7136

The above URL should take you to the PrettyGCode home page. Next you need to connect to your Moonraker or Fluidd instance. If Fluidd or Moonraker (or OctoPrint) is installed on the same machine code will attempt to detect the server type and should automatically connect. If your server is located on another machine or isn't being detected you can specifiy it on the command line like this:

http://fluiddpi.local:7136 <-Should automatically connect to the local instance of Fluidd
http://fluiddpi.local:7136?server=http://fluiddpi.local:7125 <-Connect to the local instance of Moonraker (port 7125 by default)
http://<pgcode machine url>:7136?server=http://<moonraker or fluidd url>:<port>
