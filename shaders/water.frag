#version 450 
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


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0

struct SceneSample {
    float closest_distance;
    int index;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}
// https://iquilezles.org/articles/smin
float smin( float a, float b, float k ){
    float h = max(k-abs(a-b),0.0);
    return min(a, b) - h*h*0.25/k;
}

// https://iquilezles.org/articles/smin
float smax( float a, float b, float k ){
    float h = max(k-abs(a-b),0.0);
    return max(a, b) + h*h*0.25/k;
}
float sph( vec3 i, vec3 f, ivec3 c )
{
   // random radius at grid vertex i+c
    vec3  p = 17.0*fract( (i+c)*0.3183099+vec3(0.11,0.17,0.13) );
    float w = fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
    float r = 0.7*w*w;   // distance to sphere at grid vertex i+c
   return length(f-vec3(c)) - r; 
}
float sdBase( vec3 p )
{
   ivec3 i = ivec3(floor(p));
    vec3 f =       fract(p);
   // distance to the 8 corners spheres
   return min(min(min(sph(i,f,ivec3(0,0,0)),
                      sph(i,f,ivec3(0,0,1))),
                  min(sph(i,f,ivec3(0,1,0)),
                      sph(i,f,ivec3(0,1,1)))),
              min(min(sph(i,f,ivec3(1,0,0)),
                      sph(i,f,ivec3(1,0,1))),
                  min(sph(i,f,ivec3(1,1,0)),
                      sph(i,f,ivec3(1,1,1)))));
}
float sdFbm( vec3 p, float d )
{
   float s = 1.0;
   for( int i=0; i<4; i++ )
   {
       // evaluate new octave
       float n = s*sdBase(p);
	
       // add
       n = smax(n,d-0.1*s,0.3*s);
       d = smin(n,d      ,0.3*s);

       // prepare next octave
       p = mat3( 0.00, 1.60, 1.20,
                -1.60, 0.72,-0.96,
                -1.20,-0.96, 1.28 )*p;
       s = 0.5*s;
   }
   return d;
}

float water_layer(vec3 p) {
    return p.y + sdFbm(p, 15.0);
}
float sky(vec3 p) {
    return p.y - 7.0;
}

vec3 l1_p() {
    return vec3(0.0, 10.0, 10.0);
}

SceneSample scene(vec3 p) {
    SceneSample l = SceneSample(sphere(p, l1_p(), 0.3), 1);
    SceneSample w = SceneSample(water_layer(p), 2);
    SceneSample s = SceneSample(sky(p), 3);

    return w;
}

float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}



RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += s.closest_distance;
    }

    return RayEnd(SceneSample(traveled, -1), start + direction * traveled);
}

vec4 resolve_color(int index, vec3 p) {
    if (index == 1) {
        return vec4(1.0, 1.0, 1.0, 1.0);
    }
    if (index == 2) {
        return vec4(0.0, 0.0, abs(sin(p.y* 10.0) * sin(p.x * 3.0)) + 0.2, 1.0);
    } 
    if (index == 3) {
        return vec4(0.8, 0.1, 1.0, 1.0);
    }
    return vec4(0);
}

bool is_light(int index) {
    return index == 1;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index, end.current_position);
    return color;
    vec3 light_positions[1] = vec3[](
        l1_p()
    );
    bool at_least_one_light = is_light(end.s.index);
    for (int light_index = 0; light_index < light_positions.length(); ++light_index) {
        vec3 p = light_positions[light_index];
        vec3 light_d = normalize(p - end.current_position);
        RayEnd light_traced = follow_ray(end.current_position + light_d * 0.02, light_d, 100, 50.0);
        if (is_light(light_traced.s.index)) {
            color *= resolve_color(light_traced.s.index, light_traced.current_position);
            at_least_one_light = true;
        }
    }
    if (!at_least_one_light) {
        return vec4(0.0);
    }
    return color;
}

void main(){
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0)); 

    out_color = render(vec3(0.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
} 