from UTILS import tk
from UTILS import data
from UTILS import utils
from UTILS import colors
from UTILS import path
from UTILS import ytb

from datetime import date, timedelta
from tkinter import *
import re
import os
import threading
import time
import webbrowser

import scrapetube
import pyperclip


# todo:
#  remake clean

def close():
	if env.save['today']:
		data.save(path.today, dict(sorted(t.items(), key=sort_link)))
	if env.save['youtube']:
		data.save(path.youtube, dict(sorted(y.items(), key=lambda i: i[1]['name'].lower())))
	wd.destroy()


a, s = {}, {}
t, y = data.load(path.today), data.load(path.youtube),
wd = tk.init_wd(title='Config', geometry='350x350+260+260', close_func=close)
wd.resizable()


class env:
	date_type = {
		'day': lambda date_: date_.day,
		'month': lambda date_: date_.month,
		'year': lambda date_: date_.year
	}
	days = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
	save = {'youtube': False, 'today': False}

	new_list = None


class ico:
	setting = PhotoImage(file=path.setting_30)
	switch_50 = {n: PhotoImage(file=path.switch_50 + img) for n, img in enumerate(os.listdir(path.switch_50))}
	switch_80 = {n: PhotoImage(file=path.switch_80 + img) for n, img in enumerate(os.listdir(path.switch_80))}
	search = PhotoImage(file=path.search_30)
	home = PhotoImage(file=path.home_30)
	remove = PhotoImage(file=path.remove_20)


# UTILS -------------------------------------------------------------
def get_color(val):
	if 'list' in val:
		return colors.green
	elif 'note' in val:
		return colors.orange
	elif 'date' in val:
		return colors.red
	else:
		return colors.blue


def get_date(d):
	return 'ad' if d == 'motuwethfrsasu' else d


def get_day(d):
	return d.strftime('%a')[:2].lower()


def get_geometry(wdg):
	x = 0
	_y = 0
	while True:
		wdg = wd.nametowidget(wdg.winfo_parent())
		x += wdg.winfo_x()
		_y += wdg.winfo_y()
		if wdg == wd:
			break
	return x, _y


def get_var(u, short=False):
	if os.path.exists(u):
		return '../'+os.path.basename(u)
	return u[:20]+'..' if short and len(u) > 22 else u


def get_show(u):
	return get_var(utils.clean_url(u))


def sort_link(e):
	for n, d in enumerate(env.days):
		if e[1]['days'][:2] == d:
			return n+2
	return 1


# ADD ---------------------------------------------------------------
def set_add():
	tk.destroy_frame(wd)
	tk.bind_escape(wd, close)
	wd.unbind('<MouseWheel>')
	wd.option_add('*font', ('Bahnschrift light', 15))
	Frame().pack(pady=15)
	ftop = Frame()
	ftop.pack(fill=X, pady=10, padx=30)

	for cat in ('today', 'youtube'):
		Button(
			ftop, text=cat, font=('Gotham', 12),
			command=lambda categorie=cat: threading.Thread(target=switch).start() if a['state'] != categorie else None, bd=0,
			activeforeground=(colors.red, colors.blue)[cat == 'today'], activebackground=colors.bg
		).pack(side=LEFT)
		if cat == 'today':
			a.update({'switch': Label(ftop, image=ico.switch_50[0])}), a['switch'].pack(side=LEFT, padx=2), a[
				'switch'].bind('<Button-1>', lambda _: threading.Thread(target=switch).start())
	Button(ftop, image=ico.setting, bd=0, activebackground=colors.bg, activeforeground=colors.fg, command=set_setting).pack(side=RIGHT, padx=5)
	a.update({'f': Frame()}), a['f'].pack(fill=BOTH, expand=YES, padx=20, pady=18)
	a.update({'btn': Button(text='paste', font=('Gotham', 18, 'italic'), bd=0, activebackground=colors.bg, pady=5, command=paste)}), a['btn'].pack(fill=X, padx=15, pady=5)
	Frame().pack(pady=3, side=BOTTOM)
	Button(text='save', bd=0, activebackground=colors.bg, activeforeground=colors.grey, command=add).pack(fill=X, padx=15, side=BOTTOM, pady=10)
	return wd.bind('<Return>', lambda _: add()), a.update({'state': 'today'}), set_add_state(), paste()


def set_add_state():
	tk.destroy_frame(a['f'])
	if a['state'] == 'today':
		wd.bind('<Key>', lambda _: set_setting(_.char))
		a['btn'].config(bg=colors.blue, activeforeground=colors.blue)
		frame = Frame(a['f'])
		frame.pack(fill=BOTH, expand=YES), frame.option_add('*font', ('Bahnschrift light', 13))
		for type in ['list', 'date', 'note']:
			a.update({'btn_' + type: Button(frame, text=type, fg=colors.grey, bd=0, activebackground=colors.bg, activeforeground=colors.fg, command=lambda _t=type: set_type(_t))})
			a['btn_' + type].pack(side=LEFT, fill=X, expand=YES, padx=10)
			a['btn_' + type].bind('<Button-3>', lambda _, _t=type: remove_type(_t))
		fdays = Frame(a['f'])
		fdays.pack(fill=BOTH, expand=YES)
		for d in env.days:
			a.update({d: {'state': False, 'btn': Button(fdays, bd=0, activebackground=colors.bg, activeforeground=colors.fg, bg=colors.grey, width=4, pady=6, text=d, font=('Bahnschrift light', 10), command=lambda day=d: check_date(a, day))}}), a[d]['btn'].pack(side=LEFT, padx=5, pady=5)
	else:
		wd.unbind('<Key>'), a['btn'].config(bg=colors.red, activeforeground=colors.red)
		a.update({'e': Entry(a['f'], bd=0, insertwidth=2, justify=CENTER, width=1, insertbackground=colors.red, font=('Bahnschrift light', 24))}), a['e'].pack(fill=BOTH, expand=YES, ipady=5), a['e'].focus_set()


def switch():
	if a['state'] == 'today':
		imgs, state = list(ico.switch_50.values())[1:], 'youtube'
	else:
		imgs, state = list(ico.switch_50.values())[:0:-1], 'today'
	[(a['switch'].config(image=img), time.sleep(0.02)) for img in imgs], a.update({'state': state}), set_add_state()
	if 'url' in a:
		return a.pop('url'), a['btn'].config(text='paste')
	if 'playlist' in a:
		return a.pop('playlist'), a['btn'].config(text='paste')


def create_new_list(dir_path):
	env.new_list = path.data + os.path.basename(dir_path) + '.txt'
	open(env.new_list, 'w', encoding='utf-8').write('\n'.join(dir_path + '/' + file for file in os.listdir(dir_path)))


def paste():
	p = pyperclip.paste()
	playlist_id = ytb.get_playlist(p)
	if playlist_id and playlist_id not in [video['id'] for video in y.values()]:
		if a['state'] != 'youtube':
			switch()
		if 'reverse' not in a:
			set_reverse_playlist()
		a.update({'playlist': playlist_id})
		a['btn'].config(text=get_var(a['playlist'], True))
		return
	p = utils.clean_path(p)
	if os.path.exists(p) and (p.endswith('.txt') or os.path.isdir(p)) and p not in [u['url'] for u in t.values()] and 'note' not in a and 'date' not in a:
		if os.path.isdir(p):
			create_new_list(p)
		a.update({'list': False, 'url': p})
		a['btn'].config(text=get_var(p))
		color_display(colors.green, 'list')
		return
	if a['state'] == 'today' and utils.is_valid_path(p):
		return a['btn'].config(text=get_var(p if '"' == p[0] else utils.clean_url(p), True)), a.update({'url': p})


def add():
	if a['state'] == 'today':
		if not any([a[d]['state'] for d in env.days]) or 'url' not in a:
			return wd.bell()
		add_today = {}
		if 'list' in a:
			if os.path.isdir(a['url']):
				a['url'] = env.new_list
			add_today.update({'list': a['list']})
		if 'date' in a:
			add_today.update({'date': str(a['date']), 'days': get_day(a['date'])})
		if 'note' in a:
			add_today.update({'note': a['note']})
		id_values = {'days': get_date(''.join([d for d in env.days if a[d]['state']])), 'url': a['url']}
		return id_values.update(add_today), t.update({utils.get_uid(): id_values}), env.save.update({'today': True}), close()
	elif a['state'] == 'youtube':
		e = a['e'].get()
		if 'playlist' in a:
			type = 'playlist'
			id = a['playlist']
			last_vid = ytb.get_videos_playlist(id)
			name = e if e else ytb.get_name_channel(id)
			if a['reverse']:
				last_vid = last_vid[::-1][:3]
			else:
				last_vid = last_vid[:3]
			spe = {'reverse': a['reverse']}
			webbrowser.open_new(ytb.url_watch + last_vid[0])
		else:
			if not e:
				return wd.bell()
			id_, name = ytb.search_channel(e, True)
			if id_ in [channel['id'] for channel in y.values() if channel['type'] == 'channel']:
				wd.bell()
				a['e'].delete(0, END)
				return
			type = 'channel'
			id = id_
			last_vid = ytb.get_videos_channel(id_, 3)
			spe = {}
			webbrowser.open_new(ytb.url_channel + id_ + '/videos')
		id_values = {'name': name, 'type': type, 'id': id, 'last_vid': last_vid}
		id_values.update(spe)
		y.update({utils.get_uid(): id_values})
		env.save.update({'youtube': True})
		close()


	# today ---------------------------
def color_display(color, type):
	return [a[day]['btn'].config(bg=color) for day in env.days if a[day]['state']], a['btn'].config(bg=color, activeforeground=color), a['btn_' + type].config(fg=(colors.grey, colors.fg)[type in a])


def check_date(dic, day, color=None):
	return dic[day].update({'state': (True, False)[dic[day]['state']]}), dic[day]['btn'].config(bg=(colors.grey, (color, get_color(dic))[color is None])[dic[day]['state']])


def set_type(type):
	if 'list' not in a and type == 'list' and 'url' in a and (a['url'].endswith('.txt') or os.path.isdir(a['url'])):
		if os.path.isdir(a['url']):
			create_new_list(a['url'])
		return a.update({'list': False}), color_display(colors.green, 'list')
	if ('list' not in a and type == 'list') or (type != 'list' and 'list' in a) or (type == 'list' and 'date' in a) or (type == 'list' and 'note' in a): return
	a['t'], (w, h) = Toplevel(), ((250, 80), (250, 250))[type == 'note']
	return a['t'].geometry(f'{w}x{h}+{round((wd.winfo_width() - w) / 2 + wd.winfo_x())}+{round((wd.winfo_height() - h) / 2 + wd.winfo_y())}'), a['t'].title(type.title()), a['t'].option_add('*font', ('Bahnschrift light', 18)), eval(f'set_{type}()')


def remove_type(type):
	if 'list' == type and os.path.isdir(a['url']):
		os.remove(env.new_list)
	return (a.pop(type), a['btn_' + type].config(fg=colors.grey), color_display(get_color(a), type)) if type in a else False


# LIST --------------------------------------------------------------
def set_list():
	Frame(a['t']).pack(side=LEFT, padx=5)
	Label(a['t'], text='random').pack(side=LEFT, fill=Y, expand=YES)
	a.update({'list_switch': Label(a['t'], image=ico.switch_80[0])}), a['list_switch'].pack(side=LEFT, fill=Y, expand=YES), a['list_switch'].bind('<Button-1>', lambda _: threading.Thread(target=switch_list).start())
	Frame(a['t']).pack(side=LEFT, padx=5)


def switch_list():
	return [(a['list_switch'].config(image=img), time.sleep(0.02)) for img in (list(ico.switch_80.values())[1:], list(ico.switch_80.values())[:0:-1])[a['list']]], a.update({'list': (True, False)[a['list']]})


# DATE --------------------------------------------------------------
def set_date():

	if 'date' in a:
		default_date = a['date']
	else:
		default_date = date.today() + timedelta(days=1)

	Frame(a['t']).pack(side=LEFT, padx=8)
	for date_name, date_value in env.date_type.items():
		a.update({'e_date_' + date_name: Entry(a['t'], bd=0, insertwidth=2, justify=CENTER, bg=colors.grey, insertbackground=colors.fg, width=1)}), a['e_date_' + date_name].pack(side=LEFT, fill=BOTH, expand=YES, pady=16)
		a['e_date_' + date_name].insert(0, date_value(default_date)), a['e_date_' + date_name].bind('<Return>', lambda _: add_date())
		if date_name != 'year':
			Label(a['t'], text=':').pack(side=LEFT, padx=4)
	Frame(a['t']).pack(side=LEFT, padx=8), a['e_date_day'].focus_set()


def add_date():

	def get_value(key):
		return int(a[key].get())

	try:
		new_date = date(get_value('e_date_year'), get_value('e_date_month'), get_value('e_date_day'))
	except ValueError:
		return wd.bell()

	[check_date(a, d) for d in env.days if a[d]['state']]
	a.update({'date': new_date})
	a['t'].destroy()
	check_date(a, get_day(new_date))
	color_display(colors.red, 'date')


	# note ----------------------------
def set_note():
	Label(a['t'], text='Categorie').pack(pady=20)
	a.update({
		'e_note': Entry(a['t'], bd=0, insertwidth=2, justify=CENTER, bg=colors.grey, insertbackground=colors.fg),
		'f_note': Frame(a['t']), 'cat': list(data.load(path.note)),
		'search_cat': None})
	a['e_note'].pack(fill=X, padx=20, ipady=5, pady=10)
	a['e_note'].bind('<Return>', lambda _: add_note(a['e_note'].get()))
	a['e_note'].bind('<Key>', lambda _: threading.Thread(target=search_cat).start())
	a['e_note'].focus_set(), a['f_note'].pack(fill=BOTH, expand=YES, padx=20)
	set_search_cat()
	if 'note' in a:
		a['e_note'].insert(0, a['note'])


def add_note(cat):
	if not cat:
		return wd.bell()
	return a.update({'note': cat}), a['t'].destroy(), color_display(colors.orange, 'note')


def search_cat():
	e = a['e_note'].get().lower()
	search_result = [cat for cat in a['cat'] if e in cat.lower()]
	if search_result == a['search_cat']:
		return
	if not search_result:
		return [wdg.destroy() for wdg in a['f_note'].winfo_children()], Label(a['f_note'], fg=colors.grey, text=f'new categorie "{e}"', font=('Arial italic', 12)).pack(pady=5)
	return set_search_cat(search_result), a.update({'search_cat': search_result})


def set_search_cat(cats=None):
	if not cats:
		cats = a['cat']
	return [wdg.destroy() for wdg in a['f_note'].winfo_children()], [Button(a['f_note'], text=cat, bd=0, activebackground=colors.bg, font=('Arial italic', 12), fg=colors.grey, activeforeground=colors.fg, command= lambda categorie=cat: add_note(categorie)).pack(fill=X, pady=3) for cat in cats[:3]]


	# youtube -------------------------
def set_reverse_playlist():
	a.update({'var_reverse': StringVar(), 'reverse': False}), a['var_reverse'].set('sort ↑')
	Button(a['f'], textvariable=a['var_reverse'], font=('Bahnschrift light', 12), bd=0, activeforeground=colors.red, activebackground=colors.bg, command=reverse_playlist).pack()


def reverse_playlist():
	return a['var_reverse'].set('sort ' + ('↓', '↑')[a['reverse']]), a.update({'reverse': (True, False)[a['reverse']]})


# SETTING -----------------------------------------------------------
def set_setting(insert=False):
	tk.destroy_frame(wd)
	wd.option_add('*font', ('Bahnschrift light', 13))
	wd.unbind('<Key>')
	wd.bind('<MouseWheel>', lambda e: scroll(e.delta))
	if 'l' in s:
		s.pop('l')
	Frame().pack(pady=8)
	ftop = Frame(bg=colors.grey)
	ftop.pack(fill=X, padx=16)
	Button(ftop, image=ico.search, bg=colors.grey, bd=0, activebackground=colors.grey).pack(side=LEFT, ipady=10, ipadx=10)
	s['e'] = Entry(ftop, bd=0, insertwidth=2, justify=CENTER, width=1, bg=colors.grey, insertbackground=colors.fg, font=('Bahnschrift light', 18))
	s['e'].pack(fill=X, side=LEFT, expand=YES, ipady=10)
	s['e'].focus_set()
	wd.unbind('<Escape>')
	s['e'].bind('<Escape>', lambda _: ((s['e'].delete(0, END), search()) if s['e'].get() else close()))
	s['e'].bind('<Key>', lambda _: threading.Thread(target=search).start())
	Button(ftop, image=ico.home, bg=colors.grey, bd=0, activebackground=colors.grey, command=set_add).pack(side=LEFT, ipady=10, ipadx=10)
	s.update({'f': Frame(), 'toplevel': False}), s['f'].pack(fill=BOTH, expand=YES, padx=30, pady=10), [set_template(i) for i in range(5)]
	if insert:
		s['e'].insert(0, insert)
		s.update({'i': 0})
		search()
		return
	set_ids()


def set_template(i):
	s.update({i: {'id': '', 'f': Frame(s['f'])}})
	s[i].update({'fbtn': Frame(s[i]['f']), 'var_url': StringVar()})
	s[i].update({'url': Button(s[i]['f'], textvariable=s[i]['var_url'], bd=0, activebackground=colors.bg, anchor=W)})
	s[i]['f'].pack(fill=X, pady=10)
	Button(s[i]['f'], image=ico.remove, bd=0, activebackground=colors.bg, command=lambda: delete(s[i]['id'])).pack(side=RIGHT)
	s[i]['fbtn'].pack(side=RIGHT), s[i]['url'].pack(side=LEFT, padx=5)


def scroll(side):
	if (side < 0 and (s['i']+4 == len(s['l']) or len(s['l']) < 5)) or (side > 0 and s['i'] == 0):
		return
	return s.update({'i': s['i']+(1, -1)[side > 0]}), set_ids()


def search():
	entry = utils.split_(s['e'].get().lower())
	result = {}
	if not entry:
		return s.pop('l'), set_ids()

	for n, e in enumerate(entry):
		result.update({n: {}})
		if e in ['list', 'date', 'note']:
			result[n] = {id: t[id] for id, val in t.items() if e in val}
		elif re.fullmatch('\d+', e) and 31 >= int(e) > 0:
			result[n] = {id: t[id] for id, val in t.items() if 'date' in val and e == val['date'][-2:]}
		elif e in ['channel', 'playlist']:
			result[n] = {id: y[id] for id, val in y.items() if e == val['type']}
		elif e in env.days:
			result[n] = {id: t[id] for id, val in t.items() if e in val['days'] or val['days'] == 'ad'}
		elif e == 'ad':
			result[n] = {id: t[id] for id, val in t.items() if val['days'] == 'ad'}
		elif e == 'youtube':
			result[n] = {id: y[id] for id, val in y.items()}
		else:
			result[n].update({id: t[id] for id, val in t.items() if e in utils.clean_url(val['url'])}), result[n].update({id: y[id] for id, val in y.items() if e in val['name'].lower()})

	if len(result) == 1:
		result = result[0]
	elif len(result) > 1:
		result = {id: val for id, val in result[0].items() if all([True if id in result[n] else False for n in range(1, len(result))])}

	if 'l' in s and s['l'] == result and ('no_result' in s and not result): return
	s.update({'l': result})
	if not result:
		return [wdg.destroy() for wdg in s['f'].winfo_children()], [s.pop(n) for n in range(5) if n in s], s.update({'no_result': Label(s['f'], text='nothing found', fg=colors.grey, font=('Arial italic', 13))}), s['no_result'].pack(pady=10)
	return set_ids()


def set_ids():
	if 'l' not in s:
		s.update({'l': {k: val for k, val in (list(y.items()) + list(t.items()), list(t.items()) + list(y.items()))[a['state'] == 'today']}, 'i': 0})
	if 'no_result' in s:
		s['no_result'].destroy(), s.pop('no_result')
	l = list(s['l'].items())[s['i']:s['i']+5]
	if len(l) < 5:
		[(s[n]['f'].destroy(), s.pop(n)) for n in range(len(l), 5) if n in s]
	return [set_id(i, id, val) for i, (id, val) in enumerate(l)]


def set_id(i, id, val):
	if i not in s:
		set_template(i)
	if s[i]['id'] == id:
		return
	s[i].update({'id': id}), s[i]['url'].unbind('<Button-3>'), s[i]['url'].unbind('<Shift-Button-1>')
	if 'btn' not in s[i] and ('days' in val or ('type' in val and val['type'] == 'playlist')):
		if 'var' not in s[i]:
			s[i]['var'] = StringVar()
		s[i].update({'btn': Button(s[i]['fbtn'], bd=0, activebackground=colors.bg, textvariable=s[i]['var'], width=3, padx=3, pady=3)}), s[i]['btn'].pack(padx=13)
	if 'days' in val:
		color = get_color(val)
		s[i]['var_url'].set(get_show(val['url']))
		s[i]['url'].config(command=lambda: webbrowser.open_new(utils.format_url(t[id]['url'])), activeforeground=color, fg=(colors.light_green, colors.light_blue)[os.path.exists(val['url'])])
		s[i]['btn'].config(bg=color, activeforeground=color, command=lambda: edit_days(i, id, color))

		s[i]['url'].bind('<Button-3>', lambda _: right_click(i, id))
		if 'date' in val:
			s[i]['var'].set(val['date'][-2:])
			s[i]['btn'].config(command=lambda: edit_date(i, id))
		else:
			s[i]['var'].set((val['days'], val['days'][:2] + '.')[len(val['days']) > 2])
	else:
		s[i]['var_url'].set(val['name'])
		s[i]['url'].config(activeforeground=colors.red, fg=colors.fg, command=lambda: webbrowser.open_new(utils.get_url_youtube(val)))
		if val['type'] == 'playlist':
			s[i]['var'].set(('↑', '↓')[val['reverse']]), s[i]['btn'].config(activeforeground=colors.red, bg=colors.red, command=lambda: threading.Thread(target=reverse_playlist_setting, args=(i, id,)).start())
		elif 'btn' in s[i]:
			s[i]['btn'].destroy(), s[i].pop('btn')


def right_click(i, id):
	p = utils.clean_path(pyperclip.paste())
	if utils.is_valid_path(p):
		return s[i]['var_url'].set(get_show(p)), t[id].update({'url': p}), env.save.update({'today': True})
	else:
		pyperclip.copy(t[id]['url'])


def delete(id):
	if id in t:
		pyperclip.copy(t[id]['url'])
	s['l'].pop(id), env.save.update({('youtube', 'today')[id in t]: True}), (y, t)[id in t].pop(id)
	if not s['l']:
		s.pop('l'), s['e'].delete(0, END)
	elif len(s['l']) < 4:
		pass
	elif len(s['l']) <= s['i']+4:
		if s['i'] == 0:
			return
		s.update({'i': s['i']-5})
	return set_ids()


	# youtube -------------------------
def reverse_playlist_setting(i, id):
	s[i]['var'].set(('↓', '↑')[y[id]['reverse']])
	y[id].update({'last_vid': [vid['videoId'] for vid in scrapetube.get_playlist(y[id]['id'], limit=3)] if y[id]['reverse'] else [vid['videoId'] for vid in scrapetube.get_playlist(y[id]['id'])][::-1][:3], 'reverse': (True, False)[y[id]['reverse']]}), env.save.update({'youtube': True})


# TODAY -------------------------------------------------------------
def edit_days(i, id, color=colors.blue):
	if s['toplevel']:
		return
	top = Toplevel()
	s['toplevel'] = True
	x, _y = get_geometry(s[i]['btn'])
	top.title('Edit date')
	top.protocol('WM_DELETE_WINDOW', lambda: close_days(i, id, top))
	top.geometry(f'308x48+{x - 295 + s[i]["btn"].winfo_width()}+{_y - 54}')
	for d in env.days:
		s.update({d: {'state': True if 'ad' == t[id]['days'] or d in t[id]['days'] else False}})
		s[d].update({'btn': Button(top, bd=0, activebackground=colors.bg, activeforeground=colors.fg, bg=(colors.grey, color)[s[d]['state']], width=4, pady=6, text=d, font=('Bahnschrift light', 10), command=lambda day=d: check_date(s, day, color))})
		s[d]['btn'].pack(side=LEFT, padx=5, pady=6)


def close_days(i, id, toplevel):
	if any([s[d]['state'] for d in env.days]):
		d = get_date(''.join([d for d in env.days if s[d]['state']]))
		if d != t[id]['days']:
			t[id].update({'days': d}), env.save.update({'today': True}), s[i]['var'].set((d, d[:2] + '.')[len(d) > 2])
	return toplevel.destroy(), s.update({'toplevel': False})


	# date ----------------------------
def edit_date(i, id):
	if s['toplevel']:
		return
	top = Toplevel()
	s['toplevel'] = True
	x, _y = get_geometry(s[i]['btn'])
	top.geometry(f'230x55+{x - 217 + s[i]["btn"].winfo_width()}+{_y - 60}')
	top.title('Edit specific date')
	top.protocol('WM_DELETE_WINDOW', lambda: (top.destroy(), s.update({'toplevel': False})))
	Frame(top).pack(side=LEFT, padx=5)
	for n, date_name in enumerate(env.date_type):
		s.update({'e_date_'+date_name: Entry(top, bd=0, insertwidth=2, justify=CENTER, bg=colors.grey, insertbackground=colors.fg, width=1)})
		s['e_date_' + date_name].pack(side=LEFT, fill=BOTH, expand=YES, pady=10)
		s['e_date_' + date_name].insert(0, t[id]['date'].split('-')[2 - n])
		s['e_date_' + date_name].bind('<Return>', lambda _: add_new_date(i, id, top))
		if date_name != 'year':
			Label(top, text=':').pack(side=LEFT, padx=3)
	Frame(top).pack(side=LEFT, padx=5), s['e_date_day'].focus_set()


def add_new_date(i, id, toplevel):

	def get_value(key):
		return int(s[key].get())

	try:
		new_date = date(get_value('e_date_year'), get_value('e_date_month'), get_value('e_date_day'))
	except ValueError:
		return wd.bell()

	if str(new_date) != t[id]['date']:
		t[id].update({'date': str(new_date), 'days': get_day(new_date)})
		env.save.update({'today': True})
		s[i]['var'].set(t[id]['date'][-2:])

	toplevel.destroy(), s.update({'toplevel': False})


set_add()
wd.mainloop()
