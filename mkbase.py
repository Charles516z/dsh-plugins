import numpy as np
from PIL import Image, ImageFilter
OUT=r'E:\Deepseek Harness\插件创造'
orig=np.asarray(Image.open(OUT+r'\Jayden.jpg').convert('RGB')).astype(np.float32)/255.0
a=np.asarray(Image.open(OUT+r'\Jayden_去背景.png').convert('RGBA')).astype(np.float32)/255.0
al=a[...,3]; rgb=a[...,:3]; h,w,_=orig.shape
L,R,T,Bs=280,280,185,300
W2,H2=w+L+R,h+T+Bs
g=32; gw=W2//g+1; gh=H2//g+1
acc=np.zeros((gh,gw,3),np.float64); cnt=np.zeros((gh,gw),np.float64)
by=(al<0.06); ys,xs=np.nonzero(by)
np.add.at(acc,((ys+T)//g,(xs+L)//g),orig[ys,xs]); np.add.at(cnt,((ys+T)//g,(xs+L)//g),1.0)
grid=np.zeros((gh,gw,3),np.float32); v=cnt>5; grid[v]=acc[v]/cnt[v][:,None]
filled=v.copy()
for it in range(400):
    if filled.all(): break
    nb=np.zeros_like(grid); nbc=np.zeros((gh,gw),np.float32); m=filled.astype(np.float32)
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
        sh=np.zeros_like(m); sh[max(0,dy):gh+min(0,dy), max(0,dx):gw+min(0,dx)]=m[max(0,-dy):gh-max(0,dy), max(0,-dx):gw-max(0,dx)]
        sg=np.zeros_like(grid); sg[max(0,dy):gh+min(0,dy), max(0,dx):gw+min(0,dx)]=grid[max(0,-dy):gh-max(0,dy), max(0,-dx):gw-max(0,dx)]
        nb+=sg; nbc+=sh
    upd=(~filled)&(nbc>0); grid[upd]=nb[upd]/nbc[upd][:,None]; filled|=upd
gimg=Image.fromarray((np.clip(grid,0,1)*255).astype(np.uint8))
bg=np.asarray(gimg.resize((W2,H2),Image.BICUBIC)).astype(np.float32)/255.0
bg=np.asarray(Image.fromarray((np.clip(bg,0,1)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(26))).astype(np.float32)/255.0
yy,xx=np.mgrid[0:H2,0:W2]
din=np.minimum.reduce([xx-L,(L+w-1)-xx, yy-T,(T+h-1)-yy])
t=np.clip(din/45.0,0,1); wp=t*t*(3-2*t)
canvas=bg*(1-wp[...,None])+orig[np.clip(yy-T,0,h-1),np.clip(xx-L,0,w-1)]*wp[...,None]
np.save(OUT+r'\canvas_base.npy',canvas)
print('base rebuilt',canvas.shape)
