from PIL import Image
import os
Image.MAX_IMAGE_PIXELS=None
O='assets/'
os.makedirs(O,exist_ok=True)
P={'path':('2038f738ca5fdceb5b892f71dc8814dee14fc86c','6e443f9e2713d75351469bda39d6537ba2bfad7a'),
   'lawn':('884ab470ec2d78bab15eda781e748dd7b346ee81','b6627dff34312141b63478766aa20201f77bcc43'),
   'courtyard':('d2b22c0b2617f94ba72b97d24417e1472836c0c5','ec1da0afd85f519eb5714ac5cab91640f08566ed')}
for k,(lo,hi) in P.items():
    Image.open(f'photospheres/low/{lo}.webp').convert('RGB').save(O+k+'_low.webp',quality=80)
    Image.open(f'photospheres/high/{hi}.webp').convert('RGB').resize((4096,2048),Image.LANCZOS).save(O+k+'_high.webp',quality=82)
Image.open('maps/north_aligned_2d.webp').convert('RGB').save(O+'map.webp',quality=85)
