import scrapetube
import re

# todo:
#  remake clean
#  make class ?

url = 'https://www.youtube.com/'
url_short = 'https://youtu.be/'
url_playlist = url + 'playlist?list='
url_channel = url + 'channel/'
url_watch = url + 'watch?v='
video = 'video.'
audio = 'audio.'
find_video_id = re.compile('https://(?:www\.youtube\.com/watch\?v=|youtu\.be/)(.{11})')


def get_playlist(string):
	id_ = re.findall('https://www\.youtube\.com/playlist\?list=(.{34})', string)
	if id_:
		return id_[0]
	return None


def get_channel(string):
	user = re.findall(url + '(?:@|c/)(\w+)', string, flags=re.RegexFlag.ASCII)
	if user:
		return search_channel(user[0])
	user = re.findall(url_channel + '(.{24})', string, flags=re.RegexFlag.ASCII)
	if user:
		return user[0]
	return None


def get_videos_playlist(playlist_id, limit=None):
	return [vid['videoId'] for vid in scrapetube.get_playlist(playlist_id, limit=limit)]


def get_name_channel(playlist_id):
	return next(scrapetube.get_playlist(playlist_id, limit=1))['shortBylineText']['runs'][0]['text']


def get_videos_channel(channel_id, limit=None):
	return [v['videoId'] for v in scrapetube.get_channel(channel_id, limit=limit)]


def search_channel(search, name=False):
	channel = next(scrapetube.get_search(search, results_type='channel', limit=1))
	id_ = channel['channelId']
	if name:
		return id_, channel['title']['simpleText']
	return id_
