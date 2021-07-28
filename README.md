# pgcode
PrettyGCode WebGL based GCode preview and simulator

Installation
- Install nginx. If you already have Fluidd installed this shouldn't be needed.
- Clone repo into /home/pi/
```
cd ~
git clone https://github.com/Kragrathea/pgcode.git
```

- Config nginx server
```
sudo nano /etc/nginx/sites-available/pgcode.local.conf
```

```
server {
     listen 8013;
     listen [::]:8013;
     server_name pgcode.local;

     root /home/pi/pgcode;

     index pgcode.html;

     location / {
          try_files $uri $uri/ =404;
     }
}
```
- Sanity check
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

- Default port is 8013
http://fluiddpi.local:8013