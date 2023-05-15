# Required shader inputs

```
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;
  
```

# controls 

* press "m" to toggle sliders
* press 1-0 to select slider
* up/down for increment/decrement slider values (between 0.0 and 1.0 in increments of 0.01)