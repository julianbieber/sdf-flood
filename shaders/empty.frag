#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define T u.time * 0.2

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}

void main(){
    out_color = vec4(rgb(100,200,50), 1.0);
} 
