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

#define ZWEIPIE 6.2831853071
#define FOV 100


float sphere(vec3 p, vec3 center, float radius) {
    return length(center - p) - radius;
}


void main(){
    out_color = 0.2*vec4(0,1-uv.y,0.2,1);


    if(uv.y < 0.1*sin(2.0*uv.x*sin(u.time)-0.5)+0.5){
        if(uv.x < 0.1*sin(uv.y*sin(u.time)-0.5)+0.5){
            out_color += vec4(uv,1.0,1.0);

        }else{

        }
            out_color -= 1.0 - vec4(uv, 1.0, 1.0);
    }else{

        if(uv.x < 0.1*sin(uv.y*sin(u.time)-0.5)+0.5){
            if ((uv.x-0.5)*(uv.x-0.5)/0.45  +(uv.y+0.2*sin(u.time)-0.5)*(uv.y+0.2*sin(u.time)-0.5)<(1+0.5*sin(u.time))/8){
                out_color -= 0.5*vec4(0.4,0.9,0.9,1.0)+0.1*0.9*sin(u.time);
                //out_color += 0.3*vec4(0,1-uv.y,30.0,1);
            }else{
                //out_color += 0.3*vec4(0,1-uv.y,30.0,1);
            }
            out_color += 1-vec4(uv,1.0,1.0);
        }else{
            if ((uv.x-0.5)*(uv.x-0.5)/0.45 +(uv.y+0.2*sin(u.time)-0.5)*(uv.y+0.2*sin(u.time)-0.5)<(1+0.5*sin(u.time))/8){
                out_color += 1.0-1.3*vec4(0.7,0.7,0.7,1.0)+0.03*sin(2.0*u.time);

        }


    }}


    //wellen
    if((uv.y+0.1) < 0.1*sin(4.0*uv.x*sin(u.time)-0.6*sin(u.time))+0.5){
        out_color += out_color.w*vec4(0.1,0.1,0.1, 1.0);
    }
    if((uv.y+0.35) < 0.1*cos(4.2*uv.x*sin(u.time)-0.8*sin(u.time))+0.5){
        out_color += out_color.w*2*vec4(0.1,0.1,0.1, 1.0);
    }
    if((uv.y+0.40) < 0.1*sin(4.5*uv.x*sin(u.time)-0.9*sin(u.time))+0.5){
        out_color += out_color.w*0.8*vec4(0.1,0.1,0.1, 1.0);
    }




} 
