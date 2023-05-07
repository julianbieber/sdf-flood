#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform float time;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 100

// struct SceneSample {
//     float closest_distance;
//     int index;
// }

float sphere(vec3 p, vec3 center, float radius) {
    return length(center - p) - radius;
}

float scene(vec3 p) {
    return sphere(p, vec3(0.0, 0.0, 12.0), 2.0);
}

float fov_factor() {
    return tan(FOV / 2 * PI / 180);
}

// SceneSample follow_ray(vec3 start, vec3 direction, int steps) {
//     int hit = SceneSample {
//         1000.0,
//         -1,
//     };
//     for (int i = 0; i < 100; ++i) {
//         float d = scene(start);
//         if (d < 0.0001) {
//             out_color = vec4(uv, 0.0, 1.0);
//             return 1;
//         }
//         start += direction * d;
//         out_color = vec4(0.0);
//     }

//     return hit;
// }

void main(){
    float fov = fov_factor();
    vec3 pixel_position = vec3((uv.x - 0.5) / 1.200 * fov, (uv.y - 0.5) / 1.920 * fov, 0.0);
    vec3 eye_position = vec3(0.0, 0.0, -1.0);
    vec3 ray_direction = normalize(pixel_position - eye_position); 

    // if (follow_ray(eye_position, ray_direction, 10) > 0) {
    //     out_color = vec4(uv, 0.0, 0.0);
    // } else {
    //     out_color = vec4(0.0);
    // }
    float scaling = 0.15;
    out_color = vec4((50.0 * scaling)/255.0, (31.0 * scaling)/255.0, (18.0 * scaling)/ 255.0, 1.0);
    out_color = vec4(0.0, 0.0,1.0, 1.0);
} 