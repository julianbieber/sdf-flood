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
#define T u.time * 0.2

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}

vec2 rotate2(vec2 p, float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * 
        p;
}

float fireWisp(vec2 u, float time, float scale, float i) {
    float path = sin(u.x * (scale + time * 0.8+i)) * 0.2 +
                 sin(u.x * scale * 2.3 + time * 1.1+i) * 0.1 +
                 sin(u.x * scale * 4.7 + time * 0.6+i) * 0.05;
    
    // Make fire rise upward
    path += (1.0 - u.y) * 0.3;
    
    float distance = abs(u.y - path);
    return 1.0 / (distance * 50.0 + 1.0);
}

vec3 fire(vec2 v) {
    
    vec3 fire_color = rgb(230, 100, 54);

    float fire_intensity = 0.0;

    
    float end = 20.0;

    v = rotate2(v, T);
    // v *= 10.0;
    vec2 o = v;
    // v *= 10.0;
    // v = sin(v+v);
    for (float i = 1.0; i < end; ++i) {
        float scale = end / i;
        fire_intensity += fireWisp((v), T*i, 10.1*i+fire_intensity*10.0, fract(fire_intensity)) * 0.1*scale;
        v -= vec2(0.0, 0.2*fire_intensity);
        v.y = abs(v.y);


        vec2 mv= vec2(fire_intensity)+v;
        fire_intensity -= fireWisp(rotate2(mv, scale), -T*scale, 13.3*i, min(2.0, 1.0 / fire_intensity))* 0.4;

        // fire_intensity *= fract(sin(T*v.x));
        v = rotate2(v, TAU / end+v.x);

        
    }

    return fire_color * fire_intensity;

}

void main(){
    vec2 v = (uv - 0.5) * 2.0;


    vec3 color = fire(v);

    out_color = vec4(color, 1.0);
} 
