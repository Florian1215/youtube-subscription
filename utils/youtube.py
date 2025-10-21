from UTILS import utils
from UTILS import path
from UTILS import data
from UTILS import ytb

import threading
import webbrowser
import time


# todo:
#  remake clean

def get_last_video(id, val):
	new_video = []
	if val['type'] == 'channel':
		videos = ytb.get_videos_channel(val['id'], 5)
	elif val['reverse']:
		videos = ytb.get_videos_playlist(val['id'])[::-1]
	else:
		videos = ytb.get_videos_playlist(val['id'], 5)
	for n, v in enumerate(videos):
		if v in val['last_vid']:
			if n:
				y[id].update({'last_vid': (new_video + y[id]['last_vid'])[:3]})
				data.save(path.youtube, y)
			break
		if n == 4:
			webbrowser.open_new(utils.get_url_youtube(val))
			y[id].update({'last_vid': new_video[:3]})
			data.save(path.youtube, y)
			break
		webbrowser.open_new(ytb.url_watch + v)
		new_video.append(v)


y = data.load(path.youtube)
for id_, val_ in y.items():
	threading.Thread(target=get_last_video, args=(id_, val_,)).start()
	time.sleep(0.2)
