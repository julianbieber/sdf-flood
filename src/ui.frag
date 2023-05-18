#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float slider;
} u;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 100


void main(){
    if (uv.x < u.slider) {
        if (uv.y > 0.9 || uv.y < 0.1) {
            out_color = vec4(1.0);
        } else {
            out_color = vec4(0.0, 0.0, 1.0, 1.0);
        }
    } else {
        if (uv.y > 0.9 || uv.y < 0.1) {
            out_color = vec4(1.0);
        } else {
            out_color = vec4(0.0, 1.0, 0.0, 1.0);
        }
    }

} 