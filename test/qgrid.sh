#!/bin/sh
# Join the six quake-type clips into one 3×2 comparison video with a label on each tile
set -e
D=/home/claude/mq/test/clips
FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc
lab() { echo "drawbox=x=0:y=ih-64:w=iw:h=64:color=0x2a1a12@0.82:t=fill,drawtext=fontfile=$FONT:text='$1':fontcolor=0xfff7e8:fontsize=34:x=(w-tw)/2:y=h-52"; }
ffmpeg -y -loglevel error \
  -i $D/sway.mp4 -i $D/jolt.mp4 -i $D/long.mp4 -i $D/after.mp4 -i $D/ps.mp4 -i $D/pulse.mp4 \
  -filter_complex "\
[0:v]scale=312:676,$(lab 橫向搖晃)[a];[1:v]scale=312:676,$(lab 直下型)[b];[2:v]scale=312:676,$(lab 長週期)[c];\
[3:v]scale=312:676,$(lab 餘震)[d];[4:v]scale=312:676,$(lab 'P波→S波')[e];[5:v]scale=312:676,$(lab 脈衝型)[f];\
[a][b][c][d][e][f]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart $D/quake_types.mp4
echo done $D/quake_types.mp4
