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

// https://iquilezles.org/articles/palettes/
// https://dev.thi.ng/gradients/
// https://graphtoy.com/
// https://oklch.com/#0.5147,0.0789,79.41,100


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define T u.time * 0.2

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}


float ground(vec3 p) {
    return p.y + 2.0;
}

vec3 ground_color(vec3 p) {
    return rgb(128, 98, 46);
}

vec3 cos_scaled(vec3 p) {
    return 2.0 * (cos(p) + 1.0);
}

vec3 sky_color(vec3 p) {
    return vec3(0.0) + vec3(1.0, 0.2, 0.6) * cos_scaled(vec3(1.0, 0.5, 0.5) * (tanh(p.y - 20.0)+1.0) + vec3(0.0)+T);
}

void main(){
    vec2 u = uv;
    u -= 0.5;
    u *= 2.0;
    u.y *= 1.2/1.92;

    vec3 ro = vec3(0.0, 2.0, -10.0);
    vec3 rd = normalize(vec3(u, 1.0));

    float t = 0.0;

    
    float ground_factor = 0.0;
    for (int i = 0; i < 100; ++i) {
        vec3 p =  ro + rd * t;

        float gd = ground(p);
        if (gd < 0.001) {
            ground_factor = 1.0;
            break;
        }
        t += gd;
    }
    vec3 p =  ro + rd * t;

    vec3 color = mix(sky_color(rd), ground_color(p), ground_factor);


    out_color += vec4(color, 1.0);
} 
