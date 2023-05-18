#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv; // the input variable from the vertex shader (same name and same type)
layout (binding  = 0) uniform float time;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define ZWEIPIE 6.2831853071
#define FOV 100

const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
const vec2 mys = vec2(1e4, 1e6);

vec2 rhash(vec2 uv) {
    uv *= myt;
    uv *= mys;
    return fract(fract(uv / mys) * uv);
}

vec3 hash(vec3 p) {
    return fract(
        sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)), dot(p, vec3(57.0, 113.0, 1.0)),
                 dot(p, vec3(113.0, 1.0, 57.0)))) *
        43758.5453);
}

vec3 voronoi3d( vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);

    float id = 0.0;
    vec2 res = vec2(100.0);
    for (int k = -1; k <= 1; k++) {
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec3 b = vec3(float(i), float(j), float(k));
                vec3 r = vec3(b) - f + hash(p + b);
                float d = dot(r, r);

                float cond = max(sign(res.x - d), 0.0);
                float nCond = 1.0 - cond;

                float cond2 = nCond * max(sign(res.y - d), 0.0);
                float nCond2 = 1.0 - cond2;

                id = (dot(p + b, vec3(1.0, 57.0, 113.0)) * cond) + (id * nCond);
                res = vec2(d, res.x) * cond + res * nCond;

                res.y = cond2 * d + nCond2 * res.y;
            }
        }
    }

    return vec3(sqrt(res), abs(id));
}

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float noise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //  x0 = x0 - 0. + 0.0 * C
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
                                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                               + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
}

vec3 spermute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = spermute( spermute( i.y + vec3(0.0, i1.y, 1.0 ))
                      + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float sphere(vec2 p, vec2 center, float radius) {
    return (radius - length(center - p))/radius;
}

// return 1 if v inside the box, return 0 otherwise
float insideBox(vec2 v, vec2 bottomLeft, vec2 topRight) {
    vec2 s = step(bottomLeft, v) - step(topRight, v);
    return s.x * s.y;
}

void main(){
    float sunset_time = 1/(1+pow((1.0-abs(sin(0.1*time)))/abs(sin(0.1*time)),3.0));

    float sun_time = 1.0 - sunset_time;

    //background color
    vec4 night_background_color = (1.0-uv.y)*vec4(0.52, 0.35, 0.53,1.0) + uv.y*vec4(0.08, 0.09, 0.32,1.0);
    vec4 day_time_color = (1.0-uv.y) * vec4(0.46, 0.69, 1.0,1.0) + uv.y * vec4(0.53, 0.76, 1.0,1.0);



    // day animation

    float a = 0.0;
    vec2 pos = uv;
    float forward = abs(sin(time));
    vec4 day_color = day_time_color ;
    for(float i=1.0;i<8.0;i = i+3.0)
    {
        for(float j=0.0;j<40.0;j = j+10.0){
            forward = abs(sin(0.001*time));
            //day_color = day_color+(uv.y)*noise(vec3(i*uv,j*forward))/(15.0);
            a += (uv.y)*noise(vec3(i*uv,j*forward))/(8.0);

        }

    }

    if(a>0.000000000001){
        day_color += a;
    }

    vec4 night_color = night_background_color;

    night_color += clamp(sphere(uv, vec2(cos(0.01*time)*0.7-sin(0.01*time)*0.7,cos(0.01*time)*0.7+sin(0.01*time)*0.7), 0.002), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(cos(0.008*time)*0.52-sin(0.008*time)*0.43,cos(0.008*time)*0.52+sin(0.008*time)*0.43), 0.001), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(cos(0.02*time)*0.32-sin(0.02*time)*0.57,cos(0.02*time)*0.32+sin(0.02*time)*0.57), 0.0025), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(0.20,0.49), 0.0012), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(0.1,0.9), 0.0026), 0.0,1.0) ;

    //cloud
    forward = abs(sin(time));
    for(float i=5.0;i<8.0;i = i+1.0)
    {
        for(float j=0.0;j<40.0;j = j+15.0){
            forward = abs(sin(0.01*time));
            night_color = night_color+(uv.y)*noise(vec3(i*uv,j*forward))/(80.0);
        }

    }
    /*
    float width = 0.005;
    float height = 0.3;
    vec2 start_pos = vec2(0.5,0.0);
    float ane =(2.0/4.0)*3.14159;//3.14159/2.0 = 45 grad
    if (tan(ane)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height&&uv.y > start_pos.y){
        night_color = vec4(0.0);
    }
    float ane_minus = ane;
    float ane_plus = ane;
    for(int i=0;i<3;++i)
    {

        start_pos = vec2(start_pos.x+cos(ane)*height*0.9,start_pos.y+sin(ane)*height*0.9);// how to calc this?
        width = width*0.9;
        height = height*0.8;
        for(int j=0;j<5;++j){
            ane_plus = (0.01*abs(cos(time))+1.0)*ane + j*ane*0.15;
            ane_minus = (0.01*abs(cos(time))+1.0)*ane - j*ane*0.15;
            if (tan(ane_minus)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane_minus)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height&&uv.y > start_pos.y){
                night_color = vec4(0.0);
            }
            if (tan(ane_plus)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane_plus)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height&&uv.y > start_pos.y){
                night_color = vec4(0.0);
            }
        }
        ane -= ane*0.2;
        if (tan(ane)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height&&uv.y > start_pos.y){
            night_color = vec4(0.0);
        }

    }*/


    /*float width = 2.0;
    float height = 0.3;
    vec2 start_pos = vec2(0.5,0.0);
    float ane =(0.01/4.0)*3.14159;//3.14159/2.0 = 45 grad
    if (tan(ane)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height){
        night_color -= noise(100.0*vec3(uv,1.0))*vec4(1.0,0.0,1.0,1.0);
        night_color -= noise(100.0*vec3(uv,0.0))*vec4(0.0,1.0,0.0,1.0);
    }
    width = 2.0;
    height = 0.3;
    start_pos = vec2(0.5,0.1);
    if (tan(ane)*(uv.x-start_pos.x-width)< uv.y-start_pos.y&&tan(ane)*(uv.x-start_pos.x+width)> uv.y-start_pos.y&&distance(start_pos,uv)<height){
        night_color += vec4(0.34,0.37,0.29,0.0);
        //night_color -= noise(100.0*vec3(uv,1.0))*vec4(1.0,0.0,1.0,1.0);
        night_color -= abs(noise(100.0*vec3(uv,0.0)))*vec4(0.1,0.1,0.1,0.0);
    }

    if(abs((uv.x-0.5))<0.2*(0.7-uv.y)){

        night_color += vec4(0.05,0.1,0.02,1.0);//abs((uv.x-0.5))/0.2);
    //night_color -= abs(noise(100.0*vec3(uv,0.0)))*vec4(0.2,0.1,0.2,abs((uv.x-0.5))-0.2);
    }*/
    out_color = sunset_time*night_color+sun_time*day_color ;


} 