#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 100


void main(){
    int index = int(min(uv.x * 1920.0, 1919.0));
    if (uv.y <= fft.v[index]) {
        out_color = vec4(0.0, 1.0, 0.5, 1.0);
    } else {
        out_color = vec4(1.0);
    }
} 